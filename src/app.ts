import { CurlParseError, parseCurl } from './lib/curl';
import { GENERATORS } from './lib/generate';
import { emptySpec, METHODS, type BodyKind, type Pair, type RequestSpec } from './lib/request';

const SAMPLE_CURL = `curl -X POST 'https://api.example.com/v1/users?dry_run=1' \\
  -H 'Authorization: Bearer t0ken' \\
  --json '{"name":"山田 太郎","role":"admin"}'`;

const LOGO_SVG = `
<svg viewBox="0 0 64 64" width="44" height="44" role="img" aria-label="reqbuildのロゴ">
  <title>reqbuild</title>
  <rect x="8" y="14" width="48" height="36" rx="8" fill="none" stroke="currentColor" stroke-width="4"/>
  <path d="M18 32h18" stroke="#8fd18a" stroke-width="4" stroke-linecap="round"/>
  <path d="M30 24l8 8-8 8" fill="none" stroke="#8fd18a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const BODY_KINDS: Array<{ id: BodyKind; label: string }> = [
  { id: 'none', label: 'なし' },
  { id: 'json', label: 'JSON' },
  { id: 'form', label: 'フォーム' },
  { id: 'raw', label: '生テキスト' },
];

export class App {
  private readonly el: Record<string, HTMLElement> = {};
  private spec: RequestSpec = emptySpec();
  private activeGenerator = 'curl';

  constructor(private readonly root: HTMLElement) {
    this.spec.url = 'https://api.example.com/v1/users';
    this.render();
    this.wire();
    this.syncForm();
    this.updateOutput();
  }

  private render(): void {
    this.root.innerHTML = `
      <header class="site-header">
        <span class="logo" aria-hidden="true">${LOGO_SVG}</span>
        <div>
          <h1>reqbuild</h1>
          <p class="tagline">HTTPリクエストを組み立て、curl・fetch・Python・Goのコードへ相互変換する</p>
        </div>
      </header>
      <main class="columns">
        <section class="pane">
          <h2>リクエスト</h2>
          <div class="url-row">
            <select data-id="method" aria-label="メソッド"></select>
            <input type="text" data-id="url" spellcheck="false" placeholder="https://api.example.com/path">
          </div>
          <h3>クエリパラメータ</h3>
          <div data-id="query"></div>
          <h3>ヘッダ</h3>
          <div data-id="headers"></div>
          <h3>ボディ</h3>
          <div class="kind-row" data-id="kinds"></div>
          <textarea data-id="body" rows="6" spellcheck="false" hidden></textarea>
          <h3>curlから取り込み</h3>
          <textarea data-id="import" rows="4" spellcheck="false" placeholder="curl -X POST ... を貼る"></textarea>
          <div class="import-row">
            <button type="button" class="ghost-btn" data-id="import-btn">取り込む</button>
            <button type="button" class="ghost-btn" data-id="sample">サンプルを取り込む</button>
            <span class="import-error" data-id="import-error"></span>
          </div>
        </section>
        <section class="pane">
          <div class="pane-head">
            <h2>生成コード</h2>
            <button type="button" class="primary-btn" data-id="copy">コピー</button>
          </div>
          <div class="tabs" data-id="tabs"></div>
          <pre class="code-view" data-id="output"></pre>
        </section>
      </main>
      <footer class="site-footer">
        <p>multipart/form-data(ファイル添付)、Cookie jar、リダイレクト設定などcurlの挙動オプションは対象外。組み立てはすべてブラウザ内で行い、リクエストは送信しない。</p>
      </footer>
    `;
    this.root.querySelectorAll<HTMLElement>('[data-id]').forEach((node) => {
      this.el[node.dataset.id ?? ''] = node;
    });

    const method = this.el['method'] as HTMLSelectElement;
    for (const m of METHODS) {
      const option = document.createElement('option');
      option.value = m;
      option.textContent = m;
      method.appendChild(option);
    }
    const tabs = this.el['tabs']!;
    for (const gen of GENERATORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-btn';
      btn.dataset.gen = gen.id;
      btn.textContent = gen.name;
      btn.addEventListener('click', () => {
        this.activeGenerator = gen.id;
        this.updateOutput();
      });
      tabs.appendChild(btn);
    }
    const kinds = this.el['kinds']!;
    for (const { id, label } of BODY_KINDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-btn';
      btn.dataset.kind = id;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.spec.bodyKind = id;
        this.syncForm();
        this.updateOutput();
      });
      kinds.appendChild(btn);
    }
  }

  private wire(): void {
    (this.el['method'] as HTMLSelectElement).addEventListener('change', () => {
      this.spec.method = (this.el['method'] as HTMLSelectElement).value;
      this.updateOutput();
    });
    (this.el['url'] as HTMLInputElement).addEventListener('input', () => {
      this.spec.url = (this.el['url'] as HTMLInputElement).value;
      this.updateOutput();
    });
    (this.el['body'] as HTMLTextAreaElement).addEventListener('input', () => {
      this.spec.body = (this.el['body'] as HTMLTextAreaElement).value;
      this.updateOutput();
    });
    this.el['import-btn']!.addEventListener('click', () => this.importCurl());
    this.el['sample']!.addEventListener('click', () => {
      (this.el['import'] as HTMLTextAreaElement).value = SAMPLE_CURL;
      this.importCurl();
    });
    this.el['copy']!.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.el['output']!.textContent ?? '');
    });
  }

  private importCurl(): void {
    const errorEl = this.el['import-error']!;
    try {
      this.spec = parseCurl((this.el['import'] as HTMLTextAreaElement).value);
      errorEl.textContent = '';
      this.syncForm();
      this.updateOutput();
    } catch (cause) {
      errorEl.textContent = cause instanceof CurlParseError ? cause.message : '取り込みに失敗';
    }
  }

  // specの内容をフォームへ反映する
  private syncForm(): void {
    (this.el['method'] as HTMLSelectElement).value = this.spec.method;
    (this.el['url'] as HTMLInputElement).value = this.spec.url;
    this.renderPairs(this.el['query']!, this.spec.query, 'キー', '値');
    this.renderPairs(this.el['headers']!, this.spec.headers, 'ヘッダ名', '値');
    const body = this.el['body'] as HTMLTextAreaElement;
    body.hidden = this.spec.bodyKind === 'none';
    body.value = this.spec.body;
    body.placeholder =
      this.spec.bodyKind === 'form' ? 'key=value を1行ずつ' : '{"name": "value"}';
    this.el['kinds']!.querySelectorAll<HTMLElement>('[data-kind]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.kind === this.spec.bodyKind);
    });
  }

  // key-value編集欄。末尾に常に空行を1つ置き、入力されたら行が増える
  private renderPairs(container: HTMLElement, pairs: Pair[], keyPh: string, valuePh: string): void {
    container.innerHTML = '';
    const rows = [...pairs, { key: '', value: '' }];
    rows.forEach((pair, index) => {
      const row = document.createElement('div');
      row.className = 'pair-row';
      const key = document.createElement('input');
      key.type = 'text';
      key.value = pair.key;
      key.placeholder = keyPh;
      key.spellcheck = false;
      const value = document.createElement('input');
      value.type = 'text';
      value.value = pair.value;
      value.placeholder = valuePh;
      value.spellcheck = false;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.textContent = '削除';
      remove.disabled = index === pairs.length;

      const apply = () => {
        if (index === pairs.length) {
          if (key.value !== '' || value.value !== '') {
            pairs.push({ key: key.value, value: value.value });
            this.syncForm();
            const added = container.children[index];
            (added?.querySelector('input') as HTMLInputElement | null)?.focus();
          }
        } else {
          pairs[index] = { key: key.value, value: value.value };
        }
        this.updateOutput();
      };
      key.addEventListener('input', apply);
      value.addEventListener('input', apply);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1);
        this.syncForm();
        this.updateOutput();
      });
      row.append(key, value, remove);
      container.appendChild(row);
    });
  }

  private updateOutput(): void {
    this.el['tabs']!.querySelectorAll<HTMLElement>('[data-gen]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.gen === this.activeGenerator);
    });
    const generator = GENERATORS.find((g) => g.id === this.activeGenerator) ?? GENERATORS[0];
    this.el['output']!.textContent =
      this.spec.url.trim() === '' ? '(URLを入力するとコードが生成される)' : generator.generate(this.spec);
  }
}

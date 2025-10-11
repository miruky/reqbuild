import { CurlParseError, parseCurl } from './lib/curl';
import { GENERATORS } from './lib/generate';
import { formatJson, minifyJson } from './lib/format';
import { decodeSpec, encodeSpec } from './lib/share';
import {
  choiceLabel,
  isThemeChoice,
  nextChoice,
  resolveTheme,
  type ThemeChoice,
} from './lib/theme';
import {
  emptySpec,
  fullUrl,
  METHODS,
  type BodyKind,
  type Pair,
  type RequestSpec,
} from './lib/request';

const SAMPLE_CURL = `curl -X POST 'https://api.example.com/v1/users?dry_run=1' \\
  -H 'Authorization: Bearer t0ken' \\
  --json '{"name":"山田 太郎","role":"admin"}'`;

const SPEC_KEY = 'reqbuild.spec.v1';
const GEN_KEY = 'reqbuild.generator.v1';
const THEME_KEY = 'reqbuild.theme.v1';
const HASH_PREFIX = '#r=';

const LOGO_SVG = `
<svg viewBox="0 0 64 64" role="img" aria-label="reqbuildのロゴ">
  <title>reqbuild</title>
  <rect x="7.5" y="14.5" width="49" height="35" rx="9" fill="none" stroke="currentColor" stroke-width="3"/>
  <path class="mk-accent" d="M17 32h17" stroke-width="3.4" stroke-linecap="round"/>
  <path class="mk-accent" d="M29 23.5l9 8.5-9 8.5" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON = {
  system: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4" stroke-linecap="round"/></svg>`,
  light: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" stroke-linecap="round"/></svg>`,
  dark: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 13.5A7.5 7.5 0 1 1 10.5 4a6 6 0 0 0 9.5 9.5Z" stroke-linejoin="round"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 12.5l4.2 4.5L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  link: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9.5 14.5l5-5M8 11l-2.2 2.2a3.4 3.4 0 0 0 4.8 4.8L12.8 16M16 13l2.2-2.2a3.4 3.4 0 0 0-4.8-4.8L11.2 8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const BODY_KINDS: Array<{ id: BodyKind; label: string }> = [
  { id: 'none', label: 'なし' },
  { id: 'json', label: 'JSON' },
  { id: 'form', label: 'フォーム' },
  { id: 'raw', label: '生テキスト' },
];

const THEME_ICON: Record<ThemeChoice, string> = {
  system: ICON.system,
  light: ICON.light,
  dark: ICON.dark,
};

export class App {
  private readonly el: Record<string, HTMLElement> = {};
  private spec: RequestSpec = emptySpec();
  private activeGenerator = 'curl';
  private themeChoice: ThemeChoice = 'system';
  private copyTimer = 0;

  constructor(private readonly root: HTMLElement) {
    this.themeChoice = this.loadTheme();
    this.spec = this.loadSpec();
    this.activeGenerator = this.loadGenerator();
    this.render();
    this.wire();
    this.applyTheme();
    this.syncForm();
    this.updateOutput();
    this.enableMotion();
  }

  private el_<T extends HTMLElement = HTMLElement>(id: string): T {
    const node = this.el[id];
    if (!node) throw new Error(`要素が見つからない: ${id}`);
    return node as T;
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="page">
        <header class="masthead reveal">
          <a class="brand" href="./" aria-label="reqbuild ホーム">
            <span class="brand__mark" aria-hidden="true">${LOGO_SVG}</span>
            <span class="brand__text">
              <span class="kicker">HTTP request workbench</span>
              <span class="wordmark">reqbuild</span>
            </span>
          </a>
          <button type="button" class="theme-toggle" data-id="theme">
            <span class="theme-toggle__icon" data-id="theme-icon"></span>
            <span class="theme-toggle__label" data-id="theme-label"></span>
          </button>
        </header>

        <p class="lede reveal">メソッド・URL・ヘッダー・ボディを編集すると、その定義から curl・fetch・各言語のクライアントコードを即座に書き起こします。手元の curl を貼り付ければ解析してフォームへ戻せます。変換はすべてブラウザ内で行い、入力は外部へ送りません。</p>

        <main class="workbench">
          <section class="editor reveal" aria-label="リクエストの編集">
            <div class="url-row" data-method="GET" data-id="url-wrap">
              <span class="method-select">
                <select data-id="method" aria-label="HTTPメソッド"></select>
              </span>
              <input type="text" class="url-input" data-id="url" spellcheck="false" inputmode="url" placeholder="https://api.example.com/path" aria-label="リクエストURL">
            </div>

            <div class="group">
              <p class="group__label">クエリ<span class="group__count" data-id="query-count"></span></p>
              <div class="pairs" data-id="query"></div>
            </div>

            <div class="group">
              <p class="group__label">ヘッダー<span class="group__count" data-id="headers-count"></span></p>
              <div class="pairs" data-id="headers"></div>
            </div>

            <div class="group">
              <p class="group__label">ボディ</p>
              <div class="seg" role="group" aria-label="ボディの種類" data-id="kinds"></div>
              <div class="body-tools" data-id="body-tools" hidden>
                <button type="button" class="linkish" data-id="format">JSONを整形</button>
                <button type="button" class="linkish" data-id="minify">最小化</button>
                <span class="tool-note" role="status" data-id="format-note"></span>
              </div>
              <textarea class="mono-area" data-id="body" rows="6" spellcheck="false" aria-label="リクエストボディ" hidden></textarea>
            </div>

            <div class="group">
              <p class="group__label">curl を取り込む</p>
              <textarea class="mono-area" data-id="import" rows="3" spellcheck="false" placeholder="curl -X POST 'https://...' -H '...' を貼り付け" aria-label="取り込むcurlコマンド"></textarea>
              <div class="import-row">
                <button type="button" class="btn" data-id="import-btn">取り込む</button>
                <button type="button" class="btn btn--ghost" data-id="sample">サンプル</button>
                <span class="import-error" role="status" data-id="import-error"></span>
              </div>
            </div>
          </section>

          <section class="output reveal" aria-label="生成コード">
            <div class="seg seg--tabs" role="tablist" aria-label="出力先" data-id="tabs"></div>
            <div class="output__meta">
              <span class="method-badge" data-method="GET" data-id="meta-method">GET</span>
              <span class="meta-url" data-id="meta-url"></span>
            </div>
            <div class="code-wrap">
              <div class="code-actions">
                <button type="button" class="btn btn--ghost btn--icon" data-id="share">${ICON.link}<span>共有リンク</span></button>
                <button type="button" class="btn btn--icon" data-id="copy">${ICON.copy}<span data-id="copy-label">コピー</span></button>
              </div>
              <pre class="code-view"><code role="tabpanel" tabindex="0" data-id="output"></code></pre>
            </div>
          </section>
        </main>

        <footer class="site-footer reveal">
          <p>multipart/form-data(ファイル添付)、Cookie jar、リダイレクトなど curl の挙動オプションは対象外で、素朴なリクエストの表現変換に用途を絞っています。組み立てはブラウザ内で完結し、リクエストの送信はしません。</p>
          <p class="shortcuts"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> でコピー、<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd> で共有リンク。出力タブは <kbd>←</kbd> <kbd>→</kbd> で切り替え。</p>
        </footer>
      </div>
    `;
    this.root.querySelectorAll<HTMLElement>('[data-id]').forEach((node) => {
      this.el[node.dataset.id ?? ''] = node;
    });

    const method = this.el_<HTMLSelectElement>('method');
    for (const m of METHODS) {
      const option = document.createElement('option');
      option.value = m;
      option.textContent = m;
      method.appendChild(option);
    }

    const tabs = this.el_('tabs');
    GENERATORS.forEach((gen) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seg__btn';
      btn.setAttribute('role', 'tab');
      btn.dataset.gen = gen.id;
      btn.textContent = gen.name;
      btn.addEventListener('click', () => this.selectGenerator(gen.id));
      tabs.appendChild(btn);
    });
    tabs.addEventListener('keydown', (event) => this.onTabKey(event));

    const kinds = this.el_('kinds');
    for (const { id, label } of BODY_KINDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seg__btn';
      btn.dataset.kind = id;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.spec.bodyKind = id;
        this.syncForm();
        this.update();
      });
      kinds.appendChild(btn);
    }
  }

  private wire(): void {
    const method = this.el_<HTMLSelectElement>('method');
    method.addEventListener('change', () => {
      this.spec.method = method.value;
      this.el_('url-wrap').dataset.method = method.value;
      this.update();
    });
    const url = this.el_<HTMLInputElement>('url');
    url.addEventListener('input', () => {
      this.spec.url = url.value;
      this.update();
    });
    const body = this.el_<HTMLTextAreaElement>('body');
    body.addEventListener('input', () => {
      this.spec.body = body.value;
      this.update();
    });

    this.el_('import-btn').addEventListener('click', () => this.importCurl());
    this.el_('sample').addEventListener('click', () => {
      this.el_<HTMLTextAreaElement>('import').value = SAMPLE_CURL;
      this.importCurl();
    });
    this.el_('format').addEventListener('click', () =>
      this.reformatBody(formatJson, '整形しました'),
    );
    this.el_('minify').addEventListener('click', () =>
      this.reformatBody(minifyJson, '最小化しました'),
    );
    this.el_('copy').addEventListener('click', () => void this.copyOutput());
    this.el_('share').addEventListener('click', () => void this.shareLink());
    this.el_('theme').addEventListener('click', () => this.cycleTheme());

    document.addEventListener('keydown', (event) => this.onGlobalKey(event));
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => this.applyTheme());
  }

  private selectGenerator(id: string): void {
    this.activeGenerator = id;
    safeStore(GEN_KEY, id);
    this.updateOutput();
  }

  private onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = GENERATORS.findIndex((g) => g.id === this.activeGenerator);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextGen = GENERATORS[(index + delta + GENERATORS.length) % GENERATORS.length]!;
    this.selectGenerator(nextGen.id);
    this.el_('tabs').querySelector<HTMLElement>(`[data-gen='${nextGen.id}']`)?.focus();
  }

  private onGlobalKey(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.copyOutput();
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.shareLink();
    }
  }

  private importCurl(): void {
    const errorEl = this.el_('import-error');
    try {
      this.spec = parseCurl(this.el_<HTMLTextAreaElement>('import').value);
      errorEl.textContent = '';
      errorEl.classList.remove('is-shown');
      this.syncForm();
      this.update();
    } catch (cause) {
      errorEl.textContent =
        cause instanceof CurlParseError ? cause.message : '取り込みに失敗しました';
      errorEl.classList.add('is-shown');
    }
  }

  private reformatBody(transform: (text: string) => string | null, ok: string): void {
    const note = this.el_('format-note');
    const result = transform(this.spec.body);
    if (result === null) {
      note.textContent = 'JSONとして解釈できません';
      note.classList.add('is-error');
      return;
    }
    this.spec.body = result;
    this.el_<HTMLTextAreaElement>('body').value = result;
    note.textContent = ok;
    note.classList.remove('is-error');
    this.update();
  }

  private async copyOutput(): Promise<void> {
    const ok = await copyText(this.el_('output').textContent ?? '');
    const button = this.el_('copy');
    if (this.copyTimer) window.clearTimeout(this.copyTimer);
    button.innerHTML = `${ICON.check}<span>${ok ? 'コピーしました' : '失敗しました'}</span>`;
    button.classList.add('is-done');
    this.copyTimer = window.setTimeout(() => {
      button.innerHTML = `${ICON.copy}<span>コピー</span>`;
      button.classList.remove('is-done');
    }, 1500);
  }

  private async shareLink(): Promise<void> {
    const encoded = encodeSpec(this.spec);
    const url = `${location.origin}${location.pathname}${HASH_PREFIX}${encoded}`;
    history.replaceState(null, '', `${location.pathname}${HASH_PREFIX}${encoded}`);
    const ok = await copyText(url);
    const button = this.el_('share');
    const span = button.querySelector('span');
    if (span) {
      const original = span.textContent ?? '共有リンク';
      span.textContent = ok ? 'リンクをコピー' : 'コピー失敗';
      window.setTimeout(() => {
        span.textContent = original;
      }, 1500);
    }
  }

  private cycleTheme(): void {
    this.themeChoice = nextChoice(this.themeChoice);
    safeStore(THEME_KEY, this.themeChoice);
    this.applyTheme();
  }

  private applyTheme(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = resolveTheme(this.themeChoice, prefersDark);
    document.documentElement.dataset.theme = resolved;
    const toggle = this.el_('theme');
    toggle.setAttribute('aria-label', `${choiceLabel(this.themeChoice)}(クリックで切替)`);
    toggle.setAttribute('title', choiceLabel(this.themeChoice));
    this.el_('theme-icon').innerHTML = THEME_ICON[this.themeChoice];
    this.el_('theme-label').textContent =
      this.themeChoice === 'system' ? '自動' : this.themeChoice === 'light' ? 'ライト' : 'ダーク';
  }

  // specの内容をフォームへ反映する
  private syncForm(): void {
    this.el_<HTMLSelectElement>('method').value = this.spec.method;
    this.el_('url-wrap').dataset.method = this.spec.method;
    this.el_<HTMLInputElement>('url').value = this.spec.url;
    this.renderPairs(this.el_('query'), this.spec.query, 'キー', '値');
    this.renderPairs(this.el_('headers'), this.spec.headers, 'ヘッダー名', '値');
    this.setCount('query-count', this.spec.query);
    this.setCount('headers-count', this.spec.headers);

    const body = this.el_<HTMLTextAreaElement>('body');
    body.hidden = this.spec.bodyKind === 'none';
    body.value = this.spec.body;
    body.placeholder = this.spec.bodyKind === 'form' ? 'key=value を1行ずつ' : '{"name": "value"}';
    this.el_('body-tools').hidden = this.spec.bodyKind !== 'json';
    this.el_('format-note').textContent = '';
    this.el_('kinds')
      .querySelectorAll<HTMLElement>('[data-kind]')
      .forEach((btn) => {
        const active = btn.dataset.kind === this.spec.bodyKind;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
  }

  private setCount(id: string, pairs: Pair[]): void {
    const used = pairs.filter((p) => p.key !== '').length;
    this.el_(id).textContent = used > 0 ? String(used) : '';
  }

  // key-value編集欄。末尾に常に空行を1つ置き、入力されたら行が増える
  private renderPairs(container: HTMLElement, pairs: Pair[], keyPh: string, valuePh: string): void {
    container.innerHTML = '';
    const rows = [...pairs, { key: '', value: '' }];
    rows.forEach((pair, index) => {
      const row = document.createElement('div');
      row.className = 'pair-row';
      const key = makeInput(pair.key, keyPh);
      const value = makeInput(pair.value, valuePh);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.setAttribute('aria-label', `${keyPh}の行を削除`);
      remove.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 12h12" stroke-linecap="round"/></svg>`;
      remove.disabled = index === pairs.length;

      const apply = () => {
        if (index === pairs.length) {
          if (key.value !== '' || value.value !== '') {
            pairs.push({ key: key.value, value: value.value });
            this.syncForm();
            const added = container.children[index];
            added?.querySelector('input')?.focus();
          }
        } else {
          pairs[index] = { key: key.value, value: value.value };
        }
        this.setCount(container === this.el['query'] ? 'query-count' : 'headers-count', pairs);
        this.update();
      };
      key.addEventListener('input', apply);
      value.addEventListener('input', apply);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1);
        this.syncForm();
        this.update();
      });
      row.append(key, value, remove);
      container.appendChild(row);
    });
  }

  private update(): void {
    this.persist();
    this.updateOutput();
  }

  private updateMeta(): void {
    const badge = this.el_('meta-method');
    badge.textContent = this.spec.method;
    badge.dataset.method = this.spec.method;
    const url = this.spec.url.trim();
    this.el_('meta-url').textContent = url === '' ? 'URL未入力' : fullUrl(this.spec);
  }

  private updateOutput(): void {
    this.el_('tabs')
      .querySelectorAll<HTMLElement>('[data-gen]')
      .forEach((btn) => {
        const active = btn.dataset.gen === this.activeGenerator;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
      });
    const generator = GENERATORS.find((g) => g.id === this.activeGenerator) ?? GENERATORS[0];
    this.el_('output').textContent =
      this.spec.url.trim() === ''
        ? 'URLを入力するとコードが生成されます'
        : generator.generate(this.spec);
    this.updateMeta();
  }

  private persist(): void {
    safeStore(SPEC_KEY, encodeSpec(this.spec));
  }

  private enableMotion(): void {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const root = document.documentElement;
    root.classList.add('motion');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-ready')));
  }

  private loadTheme(): ThemeChoice {
    const stored = safeRead(THEME_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  }

  private loadGenerator(): string {
    const stored = safeRead(GEN_KEY);
    return GENERATORS.some((g) => g.id === stored) ? (stored as string) : 'curl';
  }

  private loadSpec(): RequestSpec {
    if (location.hash.startsWith(HASH_PREFIX)) {
      const fromHash = decodeSpec(location.hash.slice(HASH_PREFIX.length));
      if (fromHash) return fromHash;
    }
    const stored = safeRead(SPEC_KEY);
    if (stored) {
      const fromStore = decodeSpec(stored);
      if (fromStore) return fromStore;
    }
    const initial = emptySpec();
    initial.url = 'https://api.example.com/v1/users';
    return initial;
  }
}

function makeInput(value: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.spellcheck = false;
  input.setAttribute('aria-label', placeholder);
  return input;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 権限がない・非対応の場合はフォールバックへ
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function safeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // プライベートモード等でlocalStorageが使えなくても致命ではない
  }
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

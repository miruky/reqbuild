# reqbuild

[![CI](https://github.com/miruky/reqbuild/actions/workflows/ci.yml/badge.svg)](https://github.com/miruky/reqbuild/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Test](https://img.shields.io/badge/Test-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**HTTPリクエストを組み立て、curl・fetch・各言語のクライアントコードを相互に生成するブラウザツールです。**

## 概要

メソッド・URL・クエリ・ヘッダー・ボディを画面で編集すると、その内容を curl、JavaScript の fetch、Python の requests、Go の net/http のコードとして即座に出力します。逆に、既存の curl コマンドを貼り付けると解析してフォームに展開できるため、手元のコマンドを他言語へ移し替える用途にも使えます。変換はすべてブラウザ内で完結し、入力したURLや認証情報を外部に送りません。

遊ぶ: https://miruky.github.io/reqbuild/

### なぜ作ったのか

APIを試すときは curl で叩き、実装するときは各言語のクライアントに書き直す、という往復が頻繁に起きます。そのたびにヘッダーやボディのエスケープを手で移すのは間違いのもとです。1つのリクエスト定義から各表現を機械的に生成できれば、その手間と取り違えがなくなります。curlとの双方向変換にしたのは、既存の手元コマンドを起点にできるようにするためです。

## 使い方

- メソッド・URL・クエリパラメータ・ヘッダー・ボディ(なし / JSON / フォーム)を編集します
- 出力タブで curl / fetch / Python / Go を切り替え、生成結果をコピーします
- 既存の curl コマンドを貼り付けると、解析してフォームへ反映します

## アーキテクチャ

![reqbuildのアーキテクチャ](docs/architecture.svg)

中心にあるのは編集可能な `RequestSpec` です。curl文字列は `parseCurl` でこのモデルに落とし、各ジェネレータ(`GENERATORS`)はこのモデルから各言語の表現を組み立てます。解析・生成のロジックはDOM非依存の純粋関数で、UIはモデルを編集して結果を描くだけです。

## 技術スタック

| カテゴリ | 技術 |
|:--|:--|
| 言語 | TypeScript 5(strict) |
| ビルド | Vite |
| テスト | Vitest(17テスト) |
| リンタ | ESLint + Prettier |
| CI / CD | GitHub Actions |
| 配信 | GitHub Pages |
| 実行時依存 | なし |

## プロジェクト構成

- `src/lib/request.ts` — リクエスト定義(RequestSpec)の型と操作
- `src/lib/curl.ts` — curlコマンドの解析
- `src/lib/generate.ts` — curl / fetch / Python / Go のコード生成
- `src/app.ts` — 編集フォームと出力のUI
- `src/main.ts` — マウント
- `docs/architecture.svg` — アーキテクチャ図

## はじめ方

### 前提条件

- Node.js 20 以上

### セットアップ

```bash
git clone https://github.com/miruky/reqbuild.git
cd reqbuild
npm install
npm run dev
```

### テストの実行

```bash
npm test
```

### Lintの実行

```bash
npm run lint
```

### デプロイ

`main` ブランチへのプッシュで GitHub Actions がビルドし、GitHub Pages へ配信します。

## 設計方針

- **1つの定義から多表現** — RequestSpecを単一の真実とし、各言語コードはそこから生成する
- **curlとの双方向** — 既存のcurlを解析して起点にできるようにする
- **ロジックの分離** — 解析・生成をDOM非依存にし、テストで担保する
- **データを外に出さない** — 変換はすべてブラウザ内で完結する

## 制約

生成対象は curl・fetch・Python requests・Go net/http です。multipart のファイル送信や認証フローの自動化は扱わず、素朴なリクエストの表現変換に用途を絞っています。

## ライセンス

[MIT](LICENSE)

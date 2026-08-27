---
title: 概要
---

このページは Provelopment Foundation テンプレートに含まれるサンプルです。
表示されている内容はすべて `content/pages/ja/about.md` という Markdown
ファイルから生成されています。

## コンテンツの編集

各ページは `content/pages/<locale>/<slug>.md` に配置します。フロントマターで
ページタイトルを設定し、本文は整形された Markdown としてレンダリングされます:

- **太字**、_斜体_、`インラインコード`
- [リンク](https://example.com)やリスト
- 複数レベルの見出し

### ページの追加

`content/pages/<locale>/` に新しい `.md` ファイルを作成すると、それがページに
なります。訪問者が見つけられるよう、`site.config.json` の `navigation` 配列に
追加してください。ある言語の翻訳が存在しない場合は、既定言語のコンテンツが
自動的に表示されます。

この文章を、あなたのビジネスの実際の紹介に置き換えてください。

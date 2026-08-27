import type { Dictionary } from "./dictionary";

export const ja: Dictionary = {
  home: {
    tagline: "小規模ビジネスのための高速で多言語対応のウェブサイト",
    description:
      "この説明文はご自身の内容に差し替えてください。My Site は Provelopment Foundation テンプレートのデモです。site.config.json、Markdown コンテンツ、アセットを編集して自分のものにしましょう。",
  },
  sections: {
    about: "概要",
    contact: "お問い合わせ",
    connect: "フォロー",
    navigate: "ナビゲーション",
  },
  navigation: {
    primaryLabel: "メインナビゲーション",
    footerLabel: "フッターナビゲーション",
    items: {
      "/": "ホーム",
      "/about": "概要",
      "/resources": "リソース",
    },
  },
  notFound: {
    title: "ページが見つかりません",
    message: "お探しのページは存在しません。",
    returnHome: "ホームに戻る",
  },
  language: {
    label: "言語",
  },
};
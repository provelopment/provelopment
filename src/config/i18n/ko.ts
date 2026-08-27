import type { Dictionary } from "./dictionary";

export const ko: Dictionary = {
  home: {
    tagline: "소규모 비즈니스를 위한 빠르고 다국어를 지원하는 웹사이트",
    description:
      "이 설명을 여러분의 내용으로 교체하세요. My Site는 Provelopment Foundation 템플릿의 데모입니다. site.config.json, 마크다운 콘텐츠, 에셋을 편집하여 자신만의 사이트로 만들어 보세요.",
  },
  sections: {
    about: "소개",
    contact: "연락처",
    connect: "팔로우",
    navigate: "둘러보기",
  },
  navigation: {
    primaryLabel: "기본 탐색",
    footerLabel: "푸터 탐색",
    items: {
      "/": "홈",
      "/about": "소개",
      "/resources": "리소스",
    },
  },
  notFound: {
    title: "페이지를 찾을 수 없습니다",
    message: "찾으시는 페이지가 존재하지 않습니다.",
    returnHome: "홈으로 돌아가기",
  },
};
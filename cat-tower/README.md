# 고양이 타워 (Cat Tower)

수박게임 메커니즘 기반의 고양이 진화 합성 퍼즐 웹게임. 순수 바닐라 JS로 제작.

**플레이** → 로컬에서 `index.html`을 바로 열거나 정적 서버로 서빙하면 동작합니다.

```bash
# 아무 정적 서버든 OK (예: Python)
python -m http.server 8000
# http://localhost:8000
```

## 기술 스택

| 영역 | 라이브러리 | 버전 | 비고 |
|------|------------|------|------|
| 물리엔진 | [Matter.js](https://brm.io/matter-js/) | 0.20.0 | 수박게임류 2D 물리 표준 |
| 타이포 | [Pretendard](https://github.com/orioncactus/pretendard) | 1.3.9 | 한글 가변 폰트, OFL |
| 고양이 에셋 | [Twemoji](https://github.com/jdecked/twemoji) | 15.1.0 | Twitter 디자인팀 수작 SVG, CC-BY 4.0 |

모든 외부 리소스는 jsDelivr CDN에서 로드합니다. **빌드 단계 없음 · 번들러 없음**.

## 프로젝트 구조

```
cat-tower/
├── index.html          # 단일 진입점
├── style.css           # 디자인 토큰 + 반응형
├── js/
│   ├── cats.js         # 진화 테이블 + Twemoji 로더 + 렌더러
│   └── game.js         # Matter.js 게임 로직
├── GAME_DESIGN.md      # 기획서
└── README.md
```

## 구현 현황 (Phase 1 — 프로토타입)

- [x] Matter.js 기반 10단계 합성 물리
- [x] 드래그/탭 조작 (모바일+PC)
- [x] 점수 시스템 + 연쇄 콤보 보너스
- [x] 게임 오버 판정 (위험선 2초 초과)
- [x] 로컬 최고 기록 (LocalStorage)
- [x] 메인 메뉴 / 일시정지 / 게임오버 / 조작법 모달
- [x] 모바일 세로 우선 반응형 UI

## 다음 단계

- **Phase 2**: BGM + SFX (Howler.js), 합성 이펙트 개선
- **Phase 3**: Cloudflare Workers + D1 랭킹 API, 닉네임 플로우
- **Phase 4**: 밸런싱 + 저사양 최적화
- **Phase 5**: Cloudflare Pages 배포 + AdSense 연동

## 에셋 라이선스

- **Twemoji**: 그래픽스 CC-BY 4.0, 코드 MIT ([jdecked fork](https://github.com/jdecked/twemoji))
- **Pretendard**: SIL Open Font License 1.1
- **Matter.js**: MIT

## 기획서

자세한 설계는 [GAME_DESIGN.md](./GAME_DESIGN.md) 참고.

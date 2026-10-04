(function (root) {
  "use strict";

  const STORAGE_KEY = "school-zombie-defense-lang";
  const STRINGS = {
    "boot.shell": ["스쿨 언데드 디펜스 게임 화면", "School Zombie Defense"],
    "boot.canvas": ["스쿨 언데드 디펜스 게임", "School Zombie Defense"],
    "boot.title": ["방어선 구축 중", "Building the line"],
    "boot.text": ["탄창 확인 · 바리케이드 보강 · 복도 정찰", "Checking mags · Bracing the line · Scouting the hall"],
    "boot.status": ["게임을 불러오는 중입니다.", "Loading the game."],
    "boot.rotate": ["세로 화면으로 돌려주세요", "Rotate to portrait"],
    "boot.inputHelp": [
      "키보드: Enter 출격, Esc 일시정지 또는 뒤로, F 전투 속도, 스킬 화면에서 숫자 1부터 3 또는 방향키와 Enter로 선택, R 리롤. 게임패드: A 출격 또는 선택, Start 일시정지, RB 속도, 방향 패드로 전술 선택, X 리롤, B 뒤로.",
      "Keyboard: Enter to deploy, Esc to pause or go back, F for speed. On the skill screen, 1-3 or arrows and Enter to choose, R to reroll. Gamepad: A to deploy or confirm, Start to pause, RB for speed, D-pad to choose a tactic, X to reroll, B to go back."
    ],
    "boot.noscript": ["이 게임을 플레이하려면 JavaScript가 필요합니다.", "JavaScript is required to play this game."],
    "lang.group": ["언어", "Language"],
    "loading.sortie": ["출격 준비 중", "Preparing deployment"],
    "loading.building": ["방어선 구축 중", "Building the line"],
    "loading.ready": ["전투 시스템 준비 완료", "Combat systems ready"],
    "loading.assets": ["작전 자산 동기화 · {percent}%", "Syncing assets · {percent}%"],
    "loading.retryAsset": ["일부 자산을 다시 확인하고 있습니다", "Rechecking some assets"],
    "loading.assemble": ["캐릭터 데이터와 전술 UI 조립 중", "Assembling fighters and tactics"],
    "loading.offlineTitle": ["연결을 다시 확인해 주세요", "Check your connection"],
    "loading.offlineText": ["새로고침하면 중단된 자산 동기화를 다시 시도합니다", "Refresh to retry the interrupted sync"],
    "loading.phaserFailed": ["Phaser 4 로드에 실패했습니다.", "Phaser 4 failed to load."],
    "loading.profile": ["프로필 동기화 중", "Syncing profile"],
    "loading.enterLine": ["방어선 진입 중", "Entering the line"],
    "loading.checkGear": ["장비 점검 중", "Checking gear"],
    "loading.showField": ["전장 표시 중", "Bringing up the field"],
    "loading.coins": ["보유 코인 확인 중", "Checking supplies"],
    "unit.seconds": ["{value}초", "{value}s"],
    "menu.title": ["스쿨 언데드 디펜스", "School Zombie Defense"],
    "menu.subtitle": ["무너진 복도 · 마지막 방어선", "Ruined hall · last line"],
    "menu.objective": ["바리케이드를 지키고 생존자를 규합하세요", "Hold the barricade. Rally survivors."],
    "menu.deploy": ["출격", "Deploy"],
    "menu.ranks": ["랭킹", "Ranks"],
    "menu.armory": ["상점", "Armory"],
    "menu.offline": [" 현재 오프라인 모드입니다.", " Offline mode."],
    "menu.a11y": ["메인 메뉴. 보유 보급 {coins}.{offline} Enter 또는 게임패드 A로 출격하고, L은 랭킹, A 키는 상점입니다.", "Main menu. Supplies {coins}.{offline} Enter or gamepad A to deploy, L for ranks, A key for the armory."],
    "hud.supply": ["보급", "Supplies"],
    "hud.stable": ["방어 안정", "Line stable"],
    "hud.pressure": ["방어선 압박 · 보강 권장", "Line under pressure"],
    "hud.collapse": ["붕괴 위험 · 즉시 복구 필요", "Collapse risk · repair now"],
    "stage.gate": ["교문", "Gate"],
    "stage.hall": ["복도", "Hall"],
    "stage.class": ["교실", "Classroom"],
    "stage.roof": ["옥상", "Roof"],
    "stage.line": ["STAGE {stage} · {name}", "STAGE {stage} · {name}"],
    "char.c.name": ["권총 주인공", "Point"],
    "char.c.weapon": ["권총", "Pistol"],
    "char.a.name": ["석궁 지원", "Crossbow"],
    "char.a.weapon": ["석궁", "Crossbow"],
    "char.b.name": ["소총 지원", "Rifle"],
    "char.b.weapon": ["소총", "Rifle"],
    "char.d.name": ["로켓 지원", "Rocket"],
    "char.d.weapon": ["로켓", "Rocket"],
    "char.e.name": ["저격 지원", "Sniper"],
    "char.e.weapon": ["저격총", "Sniper"],
    "char.f.name": ["화염병 지원", "Fire"],
    "char.f.weapon": ["화염병", "Firebomb"],
    "char.g.name": ["전기 지원", "Shock"],
    "char.g.weapon": ["전격 제어", "Shock Rig"],
    "char.h.name": ["엔지니어", "Engineer"],
    "char.h.weapon": ["공병 장비", "Engi Kit"],
    "tag.pistol": ["권총", "Pistol"],
    "tag.crossbow": ["석궁", "Crossbow"],
    "tag.rifle": ["소총", "Rifle"],
    "tag.rocket": ["로켓", "Rocket"],
    "tag.sniper": ["저격", "Sniper"],
    "tag.fire": ["화염", "Fire"],
    "tag.shock": ["전기", "Shock"],
    "tag.engineer": ["공병", "Engi"],
    "tag.defense": ["방어", "Defense"],
    "tag.recruit": ["영입", "Recruit"],
    "tag.tactic": ["전술", "Tactic"],
    "tag.support": ["지원", "Ally"],
    "up.c_power.title": ["강화 총열", "Reinforced Barrel"],
    "up.c_power.subtitle": ["권총 부품", "Pistol part"],
    "up.c_power.part": ["총열 내구와 탄속 보정", "Barrel life and muzzle velocity"],
    "up.c_speed.title": ["반동 스프링", "Recoil Spring"],
    "up.c_speed.subtitle": ["권총 부품", "Pistol part"],
    "up.c_speed.part": ["슬라이드 복귀 속도 개선", "Faster slide return"],
    "up.c_crit.title": ["정밀 조준기", "Match Sights"],
    "up.c_crit.subtitle": ["권총 부품", "Pistol part"],
    "up.c_crit.part": ["급소 조준 보정 모듈", "Weak-point aim module"],
    "up.a_power.title": ["강화 석궁 몸체", "Heavy Crossbow"],
    "up.a_power.subtitle": ["석궁 부품", "Crossbow part"],
    "up.a_power.part": ["장력과 볼트 속도 강화", "More draw and bolt speed"],
    "up.a_mark.title": ["표식 볼트촉", "Marked Tips"],
    "up.a_mark.subtitle": ["볼트 부품", "Bolt part"],
    "up.a_mark.part": ["약점 표식 각인 강화", "Stronger weak-point marks"],
    "up.a_crit.title": ["균형 깃털", "Balance Fletching"],
    "up.a_crit.subtitle": ["볼트 부품", "Bolt part"],
    "up.a_crit.part": ["비행 안정성과 치명 보정", "Stable flight, sharper crits"],
    "up.b_power.title": ["강선 총열", "Rifled Barrel"],
    "up.b_power.subtitle": ["소총 부품", "Rifle part"],
    "up.b_power.part": ["탄속과 관통 안정성 강화", "Velocity and stable pierce"],
    "up.b_control.title": ["가스 피스톤", "Gas Piston"],
    "up.b_control.subtitle": ["소총 부품", "Rifle part"],
    "up.b_control.part": ["연발 반동 제어 장치", "Burst recoil control"],
    "up.b_grenade.title": ["하부 유탄장치", "Underbarrel"],
    "up.b_grenade.subtitle": ["소총 부품", "Rifle part"],
    "up.b_grenade.part": ["소형 유탄 발사 모듈", "Compact grenade module"],
    "up.d_charge.title": ["성형작약 탄두", "Shaped Charge"],
    "up.d_charge.subtitle": ["로켓 부품", "Rocket part"],
    "up.d_charge.part": ["직격 관통 폭압 집중", "Focused direct blast"],
    "up.d_radius.title": ["확산 노즐", "Spread Nozzle"],
    "up.d_radius.subtitle": ["로켓 부품", "Rocket part"],
    "up.d_radius.part": ["폭발 확산각 조정", "Wider blast angle"],
    "up.d_slow.title": ["냉각 연료캡슐", "Cryo Capsule"],
    "up.d_slow.subtitle": ["로켓 부품", "Rocket part"],
    "up.d_slow.part": ["냉각 연소재 혼합", "Cold-burn mix"],
    "up.e_power.title": ["대구경 총열", "Heavy Barrel"],
    "up.e_power.subtitle": ["저격 부품", "Sniper part"],
    "up.e_power.part": ["고압탄 대응 총열 강화", "High-pressure barrel"],
    "up.e_focus.title": ["약점 스코프", "Weak-point Scope"],
    "up.e_focus.subtitle": ["저격 부품", "Sniper part"],
    "up.e_focus.part": ["취약부위 자동 보정", "Auto weak-point correction"],
    "up.e_pierce.title": ["철갑 탄심", "AP Core"],
    "up.e_pierce.subtitle": ["저격 탄약", "Sniper ammo"],
    "up.e_pierce.part": ["장갑 관통 탄심 교체", "Armor-piercing core"],
    "up.f_burn.title": ["고농도 연료", "Hot Fuel"],
    "up.f_burn.subtitle": ["화염병 재료", "Firebomb mix"],
    "up.f_burn.part": ["연소 온도와 직격 피해 강화", "Hotter hits and burn"],
    "up.f_area.title": ["확산 심지", "Spread Wick"],
    "up.f_area.subtitle": ["화염병 부품", "Firebomb part"],
    "up.f_area.part": ["불길 확산 범위와 지속시간 증가", "Wider, longer flames"],
    "up.f_throw.title": ["투척 훈련", "Throw Drill"],
    "up.f_throw.subtitle": ["화염병 전술", "Firebomb tactic"],
    "up.f_throw.part": ["투척 자세와 적중 피해 강화", "Cleaner throws, harder hits"],
    "up.g_voltage.title": ["고전압 배터리", "HV Battery"],
    "up.g_voltage.subtitle": ["전격 부품", "Shock part"],
    "up.g_voltage.part": ["전격 피해와 스턴 지속 강화", "More damage and stun"],
    "up.g_chain.title": ["전도 코일", "Conductive Coil"],
    "up.g_chain.subtitle": ["전격 부품", "Shock part"],
    "up.g_chain.part": ["연쇄 전도 반경과 횟수 보정", "Wider, longer arcs"],
    "up.g_control.title": ["절연 손잡이", "Insulated Grip"],
    "up.g_control.subtitle": ["전격 제어", "Shock control"],
    "up.g_control.part": ["방전 간격과 급소 방전 안정화", "Steadier timing and crits"],
    "up.h_turret.title": ["터렛 모터", "Turret Motor"],
    "up.h_turret.subtitle": ["공병 장비", "Engi kit"],
    "up.h_turret.part": ["휴대 터렛 출력과 회전 속도 강화", "More output and traverse"],
    "up.h_wire.title": ["강화 철조망", "Reinforced Wire"],
    "up.h_wire.subtitle": ["공병 장비", "Engi kit"],
    "up.h_wire.part": ["철조망 피해와 저지력 강화", "More damage and hold"],
    "up.h_barricade.title": ["장갑 플레이트", "Armor Plate"],
    "up.h_barricade.subtitle": ["바리케이드 부품", "Barricade part"],
    "up.h_barricade.part": ["보강 수리량과 보호막 품질 증가", "More repair and shield"],
    "shop.effect.c_power": ["피해 +{value}", "Damage +{value}"],
    "shop.effect.c_speed": ["공격 간격 -{value}", "Fire interval -{value}"],
    "shop.effect.c_crit": ["치명 +{crit} · 치명피해 +{critDmg}", "Crit +{crit} · Crit dmg +{critDmg}"],
    "shop.effect.a_power": ["피해 +{value}", "Damage +{value}"],
    "shop.effect.a_mark": ["표식 피해 +{mark} · 지속 +{time}초", "Mark damage +{mark} · Duration +{time}s"],
    "shop.effect.a_crit": ["치명 +{crit} · 치명피해 +{critDmg}", "Crit +{crit} · Crit dmg +{critDmg}"],
    "shop.effect.b_power": ["피해 +{value}", "Damage +{value}"],
    "shop.effect.b_control": ["연발 간격 -{burst} · 사격 간격 -{fire}", "Burst gap -{burst} · Fire interval -{fire}"],
    "shop.effect.b_grenade_none": ["유탄 없음", "No grenades"],
    "shop.effect.b_grenade": ["유탄 {every}세트마다", "Grenade every {every} bursts"],
    "shop.effect.d_charge": ["직격 피해 +{value}", "Direct hit +{value}"],
    "shop.effect.d_radius": ["폭발 반경 +{radius} · 폭발 피해 +{damage}", "Blast radius +{radius} · Blast damage +{damage}"],
    "shop.effect.d_slow": ["둔화 +{time}초", "Slow +{time}s"],
    "shop.effect.e_power": ["피해 +{value}", "Damage +{value}"],
    "shop.effect.e_focus": ["치명 +{crit} · 치명피해 +{critDmg}", "Crit +{crit} · Crit dmg +{critDmg}"],
    "shop.effect.e_pierce": ["관통 +{pierce} · 피해 +{damage}", "Pierce +{pierce} · Damage +{damage}"],
    "shop.effect.f_burn": ["직격 +{hit} · 구역피해 +{zone}", "Direct +{hit} · Zone dmg +{zone}"],
    "shop.effect.f_area": ["반경 +{radius} · 지속 +{time}초", "Radius +{radius} · Duration +{time}s"],
    "shop.effect.f_throw": ["피해 +{value}", "Damage +{value}"],
    "shop.effect.g_voltage": ["피해 +{damage} · 스턴 +{time}초", "Damage +{damage} · Stun +{time}s"],
    "shop.effect.g_chain": ["전도 반경 +{radius} · 연쇄 +{jumps}", "Arc radius +{radius} · Chains +{jumps}"],
    "shop.effect.g_control": ["공격 간격 -{interval} · 치명 +{crit}", "Fire interval -{interval} · Crit +{crit}"],
    "shop.effect.h_turret": ["터렛 출력 +{power} · 속도 +{speed}", "Turret power +{power} · Speed +{speed}"],
    "shop.effect.h_wire": ["철조망 피해 +{damage} · 둔화 +{slow}", "Wire damage +{damage} · Slow +{slow}"],
    "shop.effect.h_barricade": ["보강량 +{repair} · 보호막 +{shield}", "Repair +{repair} · Shield +{shield}"],
    "shop.effect.fallback": ["강화 +{value}", "Upgrade +{value}"],
    "shop.effect.maxed": ["{current}\n최대 강화 완료", "{current}\nMaxed"],
    "shop.effect.next": ["{current}\n다음: {next}", "{current}\nNext: {next}"],
    "shop.total": ["합계 Lv.{total}", "Total Lv.{total}"],
    "shop.title": ["암시장 정비소", "Field Armory"],
    "shop.supplies": ["보유 보급", "Supplies"],
    "shop.suppliesInline": ["보유 보급", "Supplies"],
    "shop.open": ["캐릭터 정비", "Maintenance"],
    "shop.openHint": ["캐릭터 선택 · 영구 강화", "Pick a fighter · permanent upgrades"],
    "shop.exit": ["상점 나가기", "Leave armory"],
    "shop.maintenance": ["캐릭터 정비", "Maintenance"],
    "shop.close": ["정비창 닫기", "Close bay"],
    "shop.pick": ["정비할 캐릭터를 선택하세요.", "Pick a fighter to service."],
    "shop.characters": ["정비할 캐릭터", "Fighters"],
    "shop.done": ["정비 마치기", "Done"],
    "shop.selected": ["{name} · {weapon} 정비", "{name} · {weapon} bay"],
    "shop.levelAria": ["{title} 강화 단계", "{title} upgrade level"],
    "shop.maxed": ["최대 강화", "Maxed"],
    "shop.buy": ["${cost} 구매", "Buy ${cost}"],
    "shop.reset": ["강화 초기화", "Reset upgrades"],
    "shop.resetRefund": ["초기화 +{refund}", "Reset +{refund}"],
    "shop.resetAsk": ["강화를 초기화할까요?", "Reset upgrades?"],
    "shop.resetEmpty": ["초기화할 강화가 없습니다", "Nothing to reset"],
    "shop.resetBody": ["구매한 영구 강화가 모두 사라지고<br>보급 ${refund}이 반환됩니다.", "Permanent upgrades are wiped.<br>${refund} supplies return."],
    "shop.resetNeedBuy": ["강화를 구매한 뒤 다시 시도하세요.", "Buy an upgrade, then try again."],
    "shop.cancel": ["취소", "Cancel"],
    "shop.ok": ["확인", "OK"],
    "shop.resetConfirm": ["초기화", "Reset"],
    "shop.processing": ["처리 중", "Working"],
    "shop.buying": ["강화 구매 중", "Buying upgrade"],
    "shop.checking": ["강화 확인 중", "Checking upgrades"],
    "shop.resetting": ["강화 초기화 중", "Resetting upgrades"],
    "shop.a11y": ["암시장 정비소. 캐릭터 정비 버튼을 누르면 정비창이 열립니다. Escape 또는 게임패드 B로 돌아갑니다.", "Field Armory. Open maintenance to upgrade a fighter. Escape or B to go back."],
    "shop.syncFail": ["프로필 동기화 실패. 잠시 후 다시 시도하세요.", "Profile sync failed. Try again shortly."],
    "toast.offlineRewards": ["오프라인 모드 · 보상 동기화 보류", "Offline · rewards will sync later"],
    "toast.profileFail": ["프로필 동기화 실패", "Profile sync failed"],
    "toast.profileSaveFail": ["계정을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.", "Your account could not be saved. Please check your browser storage."],
    "toast.noStage": ["클리어한 스테이지가 없습니다", "No cleared stage"],
    "toast.needName": ["이름을 입력하세요", "Enter a name"],
    "toast.rankCheck": ["랭킹 검증 중...", "Checking rank..."],
    "toast.rankCheckFail": ["랭킹 검증 실패", "Rank check failed"],
    "toast.rankSubmit": ["랭킹 등록 중...", "Submitting rank..."],
    "toast.rankQueued": ["기록 보관 완료 · 자동 등록 대기", "Saved · will submit when online"],
    "toast.rankDone": ["랭킹 등록 완료", "Rank submitted"],
    "toast.rankFail": ["랭킹 등록 실패", "Rank submit failed"],
    "toast.maxed": ["이미 최대 강화입니다", "Already maxed"],
    "toast.noCoins": ["코인이 부족합니다", "Not enough supplies"],
    "toast.buyFail": ["구매 처리 실패", "Purchase failed"],
    "toast.shopReset": ["강화 초기화 +{refund}", "Upgrades reset +{refund}"],
    "toast.resetFail": ["초기화 처리 실패", "Reset failed"],
    "toast.gained": ["획득 ${amount}", "Gained ${amount}"],
    "toast.rewardFail": ["보상 동기화 실패", "Reward sync failed"],
    "toast.rewardQueued": ["보상 기록 보관 완료 · 자동 정산 대기", "Rewards kept · waiting to save"],
    "toast.reroll": ["리롤 -${cost}", "Reroll -${cost}"],
    "recruit.a.tag": ["석궁", "Crossbow"],
    "recruit.a.title": ["석궁 지원 합류", "Crossbow joins"],
    "recruit.a.desc": ["볼트 지원 사격\n치명/표식 성장 해금", "Bolt support fire\nCrit and mark skills"],
    "recruit.a.line": ["표식은 내가 잡을게.", "I'll mark them."],
    "recruit.b.tag": ["소총", "Rifle"],
    "recruit.b.title": ["소총 지원 합류", "Rifle joins"],
    "recruit.b.desc": ["3연발 지원 사격\n유탄 패시브 해금", "3-round support\nGrenade passive"],
    "recruit.b.line": ["탄창 충분해. 길 열어줄게.", "Mag's full. I'll open a lane."],
    "recruit.d.tag": ["로켓", "Rocket"],
    "recruit.d.title": ["로켓 지원 합류", "Rocket joins"],
    "recruit.d.desc": ["폭발 로켓 사격\n냉각 탄두 성장", "Explosive rockets\nCryo warhead growth"],
    "recruit.d.line": ["한 발이면 복도째 정리돼.", "One shot clears the hall."],
    "recruit.e.tag": ["저격", "Sniper"],
    "recruit.e.title": ["저격 지원 합류", "Sniper joins"],
    "recruit.e.desc": ["관통 저격 사격\n방어 보강 성장", "Piercing shots\nDefense growth"],
    "recruit.e.line": ["숨 고르세요. 뒤는 제가 봅니다.", "Breathe. I've got the rear."],
    "recruit.f.tag": ["화염", "Fire"],
    "recruit.f.title": ["화염병 지원 합류", "Fire joins"],
    "recruit.f.desc": ["화염병 투척\n지속 피해 구역 생성", "Molotov throws\nBurn zones"],
    "recruit.f.line": ["불길은 제가 막아둘게요.", "I'll hold them in the fire."],
    "recruit.g.tag": ["전기", "Shock"],
    "recruit.g.title": ["전기 지원 합류", "Shock joins"],
    "recruit.g.desc": ["전격 지원 사격\n연쇄/스턴 성장 해금", "Shock support\nChain and stun"],
    "recruit.g.line": ["전원 올렸어요. 복도는 제 쪽입니다.", "Power's up. Hall's mine."],
    "recruit.h.tag": ["공병", "Engi"],
    "recruit.h.title": ["엔지니어 합류", "Engineer joins"],
    "recruit.h.desc": ["터렛·가시철조망\n바리케이드 보강 해금", "Turret and wire\nBarricade upgrades"],
    "recruit.h.line": ["설치만 끝나면 복도가 우리 편입니다.", "Once it's set, the hall is ours."],
    "recruit.fallbackTitle": ["지원 합류", "Ally joined"],
    "recruit.fallbackLine": ["전열 합류 완료", "On the line"],
    "recruit.stat": ["전투 인원 +1", "Squad +1"],
    "recruit.done": ["{title} 완료", "{title} ready"],
    "skill.choose": ["선택", "Select"],
    "skill.now": ["즉시 적용", "Applies now"],
    "skill.applied": ["{title} 적용", "{title} online"],
    "skill.title": ["전술 보급 선택", "Pick a supply"],
    "skill.subtitle": ["WAVE {wave} · 세 가지 중 하나를 선택하세요", "WAVE {wave} · Pick one of three"],
    "skill.hint": ["카드를 탭하거나 숫자 1–3으로 즉시 적용", "Tap a card or press 1-3"],
    "skill.reroll": ["R · 리롤 ${cost}", "R · Reroll ${cost}"],
    "skill.rerollDone": ["리롤 완료", "Reroll used"],
    "skill.a11yOpen": ["웨이브 {wave} 보급 선택. 숫자 1부터 3으로 전술을 고르고 R로 한 번 리롤할 수 있습니다.", "Wave {wave} supply pick. Keys 1 to 3 choose a tactic. R rerolls once."],
    "skill.a11yCard": ["전술 {index}. {title}. {desc}", "Tactic {index}. {title}. {desc}"],
    "skill.stat.damage": ["피해 {from} → {to}", "Damage {from} → {to}"],
    "skill.stat.interval": ["공격 간격 {from} → {to}", "Interval {from} → {to}"],
    "skill.stat.followup": ["연속 사격 {from}회 → {to}회", "Follow-up {from} → {to}"],
    "skill.stat.pierceDamage": ["관통 {pierceFrom} → {pierceTo}\n피해 {from} → {to}", "Pierce {pierceFrom} → {pierceTo}\nDamage {from} → {to}"],
    "skill.stat.crit": ["치명률 {critFrom} → {critTo}\n치명 피해 {dmgFrom} → {dmgTo}", "Crit {critFrom} → {critTo}\nCrit dmg {dmgFrom} → {dmgTo}"],
    "skill.stat.mark": ["표식 피해 {from} → {to}\n표식 지속 {timeFrom} → {timeTo}", "Mark damage {from} → {to}\nMark time {timeFrom} → {timeTo}"],
    "skill.stat.slowMark": ["둔화 {slowFrom} → {slowTo}\n표식 피해 {markFrom} → {markTo}", "Slow {slowFrom} → {slowTo}\nMark damage {markFrom} → {markTo}"],
    "skill.stat.grenadeUnlock": ["유탄 없음 → {sets}세트\n폭발 {blastFrom}→{blastTo} · 범위 {areaFrom}→{areaTo}", "No grenade → every {sets}\nBlast {blastFrom}→{blastTo} · Area {areaFrom}→{areaTo}"],
    "skill.stat.grenade": ["유탄 {from}→{to}세트\n폭발 {blastFrom}→{blastTo} · 범위 {areaFrom}→{areaTo}", "Grenade {from}→{to} bursts\nBlast {blastFrom}→{blastTo} · Area {areaFrom}→{areaTo}"],
    "skill.stat.burstControl": ["연사 {from}회 → {to}회\n간격 {gapFrom} → {gapTo}", "Burst {from} → {to}\nGap {gapFrom} → {gapTo}"],
    "skill.stat.slowDamage": ["둔화 {slowFrom} → {slowTo}\n피해 {from} → {to}", "Slow {slowFrom} → {slowTo}\nDamage {from} → {to}"],
    "skill.stat.rocketDamage": ["로켓 피해 {from} → {to}", "Rocket damage {from} → {to}"],
    "skill.stat.slowDirect": ["둔화 {slowFrom} → {slowTo}\n직격 피해 {from} → {to}", "Slow {slowFrom} → {slowTo}\nDirect hit {from} → {to}"],
    "skill.stat.radiusBlast": ["반경 {from} → {to}\n폭발 피해 {dmgFrom} → {dmgTo}", "Radius {from} → {to}\nBlast damage {dmgFrom} → {dmgTo}"],
    "skill.stat.direct": ["직격 피해 {from} → {to}", "Direct hit {from} → {to}"],
    "skill.stat.sniperDamage": ["저격 피해 {from} → {to}", "Sniper damage {from} → {to}"],
    "skill.stat.pierceSniper": ["관통 {pierceFrom} → {pierceTo}\n저격 피해 {from} → {to}", "Pierce {pierceFrom} → {pierceTo}\nSniper damage {from} → {to}"],
    "skill.stat.flame": ["불길 피해 {from} → {to}", "Burn damage {from} → {to}"],
    "skill.stat.radiusZone": ["반경 {from} → {to}\n구역 피해 {dmgFrom} → {dmgTo}", "Radius {from} → {to}\nZone damage {dmgFrom} → {dmgTo}"],
    "skill.stat.burnBase": ["연소 기준 {from} → {to}\n구역 피해 {dmgFrom} → {dmgTo}", "Burn base {from} → {to}\nZone damage {dmgFrom} → {dmgTo}"],
    "skill.stat.slowHold": ["둔화 {slowFrom} → {slowTo}\n지속 {timeFrom} → {timeTo}", "Slow {slowFrom} → {slowTo}\nDuration {timeFrom} → {timeTo}"],
    "skill.stat.shock": ["전격 피해 {from} → {to}", "Shock damage {from} → {to}"],
    "skill.stat.stunChain": ["스턴 {stunFrom} → {stunTo}\n연쇄 피해 {from} → {to}", "Stun {stunFrom} → {stunTo}\nChain damage {from} → {to}"],
    "skill.stat.chainRadius": ["연쇄 {from}회 → {to}회\n전도 반경 {radiusFrom} → {radiusTo}", "Chains {from} → {to}\nArc radius {radiusFrom} → {radiusTo}"],
    "skill.stat.nail": ["못탄 피해 {from} → {to}", "Nail damage {from} → {to}"],
    "skill.stat.turretNew": ["터렛 0/1 → 1/1\n출력 {from} → {to}", "Turret 0/1 → 1/1\nOutput {from} → {to}"],
    "skill.stat.turretOwned": ["터렛 설치됨\n출력 {from} → {to}", "Turret up\nOutput {from} → {to}"],
    "skill.stat.wire": ["피해 {from} → {to}\n둔화 {slowFrom} → {slowTo}", "Damage {from} → {to}\nSlow {slowFrom} → {slowTo}"],
    "skill.stat.barricade": ["HP {hpFrom}/{hpMax} → {hpTo}/{hpMax}\n보호막 {shieldFrom} → {shieldTo}", "HP {hpFrom}/{hpMax} → {hpTo}/{hpMax}\nShield {shieldFrom} → {shieldTo}"],
    "skill.c-impact.title": ["강화 탄환", "Hot Rounds"],
    "skill.c-impact.desc": ["기본 탄환의 위력을\n안정적으로 끌어올립니다.", "Steady boost\nto pistol damage."],
    "skill.c-rapid.title": ["권총 속사", "Pistol Rapid"],
    "skill.c-rapid.desc": ["가까이 붙은 적을\n더 빠르게 끊어냅니다.", "Cuts down close targets\nfaster."],
    "skill.c-multishot.title": ["연속 사격", "Follow-up Burst"],
    "skill.c-multishot.desc": ["한 번의 자동 사격을\n빠르게 이어 쏩니다.", "Adds another shot\nto each burst."],
    "skill.c-pierce.title": ["관통 탄환", "Piercing Rounds"],
    "skill.c-pierce.desc": ["앞줄을 뚫고\n뒤쪽 좀비까지 맞춥니다.", "Punches the front line\nand hits the next."],
    "skill.a-force.title": ["고장력 석궁 현", "Heavy String"],
    "skill.a-force.desc": ["석궁 현의 장력을 높여\n정면 피해를 강화합니다.", "Heavier draw.\nHarder frontal hits."],
    "skill.a-rally.title": ["집중 호흡", "Steady Breath"],
    "skill.a-rally.desc": ["조준에 집중할수록\n치명타가 날카로워집니다.", "Focus tightens aim.\nCrits hit harder."],
    "skill.a-mark.title": ["약점 표식", "Weak-point Mark"],
    "skill.a-mark.desc": ["표식이 붙은 적이\n더 큰 피해를 받습니다.", "Marked targets\ntake extra damage."],
    "skill.a-pin.title": ["속박 볼트", "Pinning Bolt"],
    "skill.a-pin.desc": ["맞은 좀비의 발을\n잠시 묶어둡니다.", "A hit pins their feet\nfor a moment."],
    "skill.a-pierce.title": ["관통 볼트", "Piercing Bolt"],
    "skill.a-pierce.desc": ["볼트가 깊게 박혀\n일렬의 적을 꿰뚫습니다.", "Bolts punch through\na line of undead."],
    "skill.b-caliber.title": ["대구경 탄창", "Heavy Mag"],
    "skill.b-caliber.desc": ["기본 소총탄의 저지력을\n한 단계 끌어올립니다.", "Rifle rounds\nhit a step harder."],
    "skill.b-barrage.title": ["하부 유탄", "Underbarrel"],
    "skill.b-barrage.desc": ["연발 중간마다\n소형 폭발을 섞습니다.", "Mixes a small blast\ninto the burst cycle."],
    "skill.b-rifle.title": ["연발 제어", "Burst Control"],
    "skill.b-rifle.desc": ["여러 적에게\n탄막을 짧게 끊어 쏩니다.", "Short bursts\nacross multiple targets."],
    "skill.b-suppress.title": ["제압 사격", "Suppressing Fire"],
    "skill.b-suppress.desc": ["연발 탄막으로\n전진 속도를 끊습니다.", "Bursts slow\ntheir advance."],
    "skill.d-warhead.title": ["고밀도 탄두", "Dense Warhead"],
    "skill.d-warhead.desc": ["기본 로켓의 폭압을\n더 묵직하게 압축합니다.", "Packs the rocket's\nblast tighter."],
    "skill.d-frost.title": ["냉각 탄두", "Cryo Warhead"],
    "skill.d-frost.desc": ["폭발에 휘말린 적을\n느리게 만듭니다.", "The blast slows\nanything it catches."],
    "skill.d-rocket.title": ["고폭 탄두", "HE Warhead"],
    "skill.d-rocket.desc": ["몰려 있는 좀비를\n더 넓게 쓸어냅니다.", "Sweeps clustered undead\nin a wider blast."],
    "skill.d-impact.title": ["직격 장약", "Impact Charge"],
    "skill.d-impact.desc": ["정면으로 맞은 대상에게\n더 묵직하게 박힙니다.", "Direct hits\nland much harder."],
    "skill.d-reload.title": ["고속 장전", "Fast Reload"],
    "skill.d-reload.desc": ["무거운 탄두를\n더 빠르게 밀어 넣습니다.", "Gets the next rocket\nup faster."],
    "skill.e-caliber.title": ["대구경 탄환", "Heavy Round"],
    "skill.e-caliber.desc": ["기본 저격탄의 관통력을\n순수 피해로 끌어올립니다.", "Turns sniper punch\ninto raw damage."],
    "skill.e-weakpoint.title": ["약점 조준", "Weak-point Aim"],
    "skill.e-weakpoint.desc": ["큰 위협을 노릴 때\n한 발의 위력이 커집니다.", "Big threats take\na harder shot."],
    "skill.e-sniper.title": ["철갑 저격", "AP Sniper"],
    "skill.e-sniper.desc": ["앞줄을 꿰뚫고\n뒤쪽 위협까지 노립니다.", "Pierces the front\nto reach the next threat."],
    "skill.e-reload.title": ["정밀 재장전", "Precision Reload"],
    "skill.e-reload.desc": ["조준을 유지한 채\n다음 탄을 빠르게 올립니다.", "Stays on target\nand chambers faster."],
    "skill.f-fuel.title": ["고열 연료", "Hot Fuel"],
    "skill.f-fuel.desc": ["화염병이 남기는 불길의\n연소 피해를 강화합니다.", "Flames left behind\nburn harder."],
    "skill.f-zone.title": ["번지는 불길", "Spreading Fire"],
    "skill.f-zone.desc": ["화염병이 남기는 불길이\n더 넓게 번집니다.", "The burn patch\nspreads wider."],
    "skill.f-bottle.title": ["농축 화염병", "Concentrated Mix"],
    "skill.f-bottle.desc": ["연소 기준 피해를 높이고\n불길 지속 피해를 강화합니다.", "Hotter impact\nand a stronger burn."],
    "skill.f-sticky.title": ["끈적한 연소", "Sticky Burn"],
    "skill.f-sticky.desc": ["불길에 붙은 좀비가\n잠시 발이 묶입니다.", "Burning undead\nstick in place."],
    "skill.g-amplifier.title": ["증폭 전극", "Amp Electrode"],
    "skill.g-amplifier.desc": ["기본 전격탄의 출력을 높여\n첫 타 피해를 강화합니다.", "More voltage\non the first hit."],
    "skill.g-voltage.title": ["고전압 코일", "HV Coil"],
    "skill.g-voltage.desc": ["전격탄이 더 오래 붙잡아\n스턴 시간을 늘립니다.", "Holds them longer\nin the stun."],
    "skill.g-chain.title": ["연쇄 전도", "Chain Arc"],
    "skill.g-chain.desc": ["전격이 근처 좀비로\n한 번 더 튀어 오릅니다.", "The arc jumps\nto another nearby."],
    "skill.g-overload.title": ["과부하 방전", "Overload"],
    "skill.g-overload.desc": ["전격탄의 급소 확률과\n치명 피해가 증가합니다.", "More crits,\nharder crit damage."],
    "skill.h-nail.title": ["강화 못탄", "Hardened Nails"],
    "skill.h-nail.desc": ["기본 못탄을 더 단단하게\n가공해 피해를 높입니다.", "Tougher nails.\nMore damage."],
    "skill.h-turret.title": ["휴대 터렛", "Portable Turret"],
    "skill.h-turret.titleOwned": ["터렛 출력 강화", "Turret Boost"],
    "skill.h-turret.desc": ["방어선 앞에 자동 터렛을\n설치하거나 강화합니다.", "Drops an auto turret\nor boosts the one up."],
    "skill.h-wire.title": ["가시철조망", "Barbed Wire"],
    "skill.h-wire.titleOwned": ["철조망 보강", "Wire Reinforced"],
    "skill.h-wire.desc": ["진입로에 철조망을 깔아\n접근한 좀비를 늦춥니다.", "Wire on the approach\nslows anything that hits it."],
    "skill.h-barricade.title": ["바리케이드 보강", "Barricade Plating"],
    "skill.h-barricade.desc": ["방어선에 장갑판과\n임시 보호막을 덧댑니다.", "Adds plate and\na temporary shield."],
    "skill.core.title": ["완전 복구", "Full Repair"],
    "skill.core.desc": ["방어선을 즉시\n최대 HP까지 수리", "Repairs the line\nto full HP now"],
    "skill.core.toast": ["방어선 완전 복구", "Line fully repaired"],
    "run.a11yStart": ["작전 시작. Escape 또는 Start로 일시정지하고 F 또는 오른쪽 범퍼로 속도를 바꿉니다.", "Op started. Escape or Start to pause. F or RB to change speed."],
    "run.a11yPause": ["일시정지. 스테이지 {stage}, 웨이브 {wave}, 바리케이드 {hp}. Escape 또는 Start로 계속합니다.", "Paused. Stage {stage}, wave {wave}, barricade {hp}. Escape or Start to resume."],
    "run.a11yResume": ["작전을 계속합니다.", "Resuming the op."],
    "pause.title": ["작전 일시정지", "Op paused"],
    "pause.time": ["생존 시간", "Time"],
    "pause.kills": ["처치", "Kills"],
    "pause.core": ["바리케이드 무결성", "Barricade"],
    "pause.speed": ["전투 속도", "Speed"],
    "pause.resume": ["계속 방어", "Keep fighting"],
    "pause.exit": ["작전 종료", "End op"],
    "pause.hint": ["홈 버튼은 먼저 이 화면을 열어 진행 손실을 방지합니다", "Home opens this screen first so you don't lose the run"],
    "pause.quitTitle": ["작전을 종료할까요?", "End the op?"],
    "pause.quitBody": ["현재 보급 ${coins}을 정산하고\n메인 화면으로 복귀합니다.", "Bank ${coins} supplies\nand return to the menu."],
    "pause.quit": ["종료", "End"],
    "rank.loading": ["랭킹을 불러오는 중...", "Loading ranks..."],
    "rank.loadFailed": ["랭킹을 불러오지 못했습니다", "Could not load ranks"],
    "rank.title": ["스테이지 랭킹", "Stage ranks"],
    "rank.subtitle": ["클리어 스테이지 우선 · 동률 시 처치 수", "Cleared stage first · kills break ties"],
    "rank.empty": ["첫 방어 기록을 남겨보세요", "Leave the first defense record"],
    "rank.network": ["네트워크 상태를 확인한 뒤 다시 시도합니다", "Check the network, then retry"],
    "rank.emptyHint": ["스테이지를 클리어하면 자동으로 등록할 수 있습니다", "Clear a stage to submit"],
    "rank.retry": ["다시 불러오기", "Retry"],
    "rank.menu": ["메인으로", "Menu"],
    "rank.submit": ["기록 등록", "Submit"],
    "rank.a11y": ["랭킹 화면. {detail} Escape 또는 B로 뒤로 갑니다.", "Rankings. {detail} Escape or B to go back."],
    "rank.a11yCount": ["{count}개의 기록을 표시합니다.", "Showing {count} records."],
    "rank.a11yEmpty": ["등록된 기록이 없습니다.", "No records yet."],
    "rank.prep": ["랭킹 등록 준비 중", "Preparing rank submit"],
    "rank.dialogTitle": ["랭킹 등록", "Submit rank"],
    "rank.score": ["클리어 St.{score} · 처치 {kills}", "Cleared St.{score} · Kills {kills}"],
    "rank.gameOverTitle": ["게임 오버 랭킹 등록", "Game over rank submit"],
    "rank.nameLabel": ["랭킹에 표시할 닉네임", "Nickname shown on the board"],
    "rank.namePlaceholder": ["닉네임 입력", "Nickname"],
    "rank.nameHelp": ["최대 20자. 등록하거나 나중에 버튼으로 건너뛸 수 있습니다.", "Up to 20 characters. Submit or skip."],
    "rank.sending": ["랭킹 신호 송신 중", "Sending rank"],
    "rank.register": ["등록", "Submit"],
    "rank.later": ["나중에", "Later"],
    "rank.registering": ["등록 중", "Sending"],
    "over.title": ["방어선 붕괴", "Line down"],
    "over.wave": ["웨이브 {level} · 처치 {kills}", "Wave {level} · Kills {kills}"],
    "over.stage": ["클리어 St.{score} · 도달 St.{reached}", "Cleared St.{score} · Reached St.{reached}"],
    "over.coins": ["획득 ${earned} · 보유 ${held}", "Gained ${earned} · Held ${held}"],
    "over.coinsPending": ["정산 대기 ${earned} · 보유 ${held}", "Pending ${earned} · Held ${held}"],
    "over.menu": ["메뉴", "Menu"],
    "over.a11y": ["방어선 붕괴. 웨이브 {level}, 처치 {kills}. 기록을 등록하거나 메뉴로 돌아갈 수 있습니다.", "Line down. Wave {level}, kills {kills}. Submit a record or return to menu."]
  };

  const ko = {};
  const en = {};
  Object.keys(STRINGS).forEach((key) => {
    ko[key] = STRINGS[key][0];
    en[key] = STRINGS[key][1];
  });
  const DICTS = { ko, en };

  function pathnameForcesEnglish(pathname) {
    const path = String(pathname || "").split("?")[0].split("#")[0].replace(/\/+$/, "");
    return /(?:^|\/)index-en(?:\.html)?$/.test(path);
  }

  function normalizeLang(value) {
    const lang = String(value || "").toLowerCase();
    if (lang === "en" || lang === "ko") return lang;
    return "";
  }

  function persist(lang) {
    try {
      root.localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      /* private mode and file views can block storage */
    }
  }

  function resolveLang() {
    const loc = root.location;
    if (loc && pathnameForcesEnglish(loc.pathname)) return "en";
    if (loc) {
      const queryLang = normalizeLang(new URLSearchParams(loc.search || "").get("lang"));
      if (queryLang) return queryLang;
    }
    try {
      const stored = normalizeLang(root.localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch (error) {
      /* ignore unavailable storage */
    }
    const docLang = normalizeLang(root.document && root.document.documentElement && root.document.documentElement.lang);
    if (docLang) return docLang;
    return "ko";
  }

  let current = "ko";

  function interpolate(text, vars) {
    if (!vars) return text;
    return String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null ? String(vars[name]) : match
    ));
  }

  function t(key, vars) {
    const id = String(key);
    const localized = DICTS[current] && DICTS[current][id];
    const text = localized != null ? localized : ko[id] != null ? ko[id] : id;
    return interpolate(text, vars);
  }

  function applyDocument() {
    const doc = root.document;
    if (!doc || !doc.documentElement) return;
    doc.documentElement.lang = current;
    const setText = (selector, key) => {
      const node = doc.querySelector(selector);
      if (node) node.textContent = t(key);
    };
    const loadingTitle = doc.querySelector(".loading__title");
    if (loadingTitle) {
      const knownTitles = new Set([ko["boot.title"], en["boot.title"], ko["loading.building"], en["loading.building"]]);
      if (knownTitles.has(loadingTitle.textContent)) loadingTitle.textContent = t("boot.title");
    }
    const loadingText = doc.querySelector(".loading__text");
    if (loadingText) {
      const knownText = new Set([ko["boot.text"], en["boot.text"]]);
      if (knownText.has(loadingText.textContent)) loadingText.textContent = t("boot.text");
    }
    setText(".rotate-lock strong", "boot.rotate");
    setText("#game-input-help", "boot.inputHelp");
    const status = doc.getElementById("game-a11y-status");
    if (status) {
      const knownStatus = new Set([ko["boot.status"], en["boot.status"], ""]);
      if (knownStatus.has(status.textContent)) status.textContent = t("boot.status");
    }
    const shell = doc.getElementById("game-shell");
    if (shell) shell.setAttribute("aria-label", t("boot.shell"));
    const noscript = doc.querySelector("noscript");
    if (noscript) noscript.textContent = t("boot.noscript");
  }

  function getLang() {
    return current;
  }

  function setLang(lang) {
    const next = normalizeLang(lang);
    if (!next) return current;
    current = next;
    persist(current);
    applyDocument();
    return current;
  }

  current = resolveLang();
  persist(current);
  applyDocument();

  root.SchoolI18n = { t, getLang, setLang };
})(typeof window !== "undefined" ? window : globalThis);

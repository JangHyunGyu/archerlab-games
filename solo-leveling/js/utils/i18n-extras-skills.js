/** Locale extras: skills. */
export function apply_skills(TEXTS) {
  const extra = {
  "ko": {
    "weapons": {
      "lightPierce": {
        "name": "빛가름 검격",
        "desc": "가까운 적을 광휘의 검날로 빠르게 베어냅니다."
      },
      "lightLance": {
        "name": "섬광 찌르기",
        "desc": "빛의 창끝처럼 전방을 빠르게 관통해 찌릅니다."
      },
      "lightCrescent": {
        "name": "광휘 참격",
        "desc": "전방에 넓은 빛의 검기를 휘둘러 적을 벱니다."
      },
      "lightJudgment": {
        "name": "심판의 낙광",
        "desc": "적 무리 위에 압축된 빛을 떨어뜨려 범위 피해를 줍니다."
      },
      "lightSanctum": {
        "name": "성광 압박",
        "desc": "찬란한 위압으로 주변 적에게 피해를 주고 움직임을 늦춥니다."
      },
      "tigerPalm": {
        "name": "백호 장타",
        "desc": "근접 적에게 묵직한 손날 타격을 꽂아 넣습니다."
      },
      "tigerFang": {
        "name": "백호 송곳니",
        "desc": "짧은 거리에서 백호의 송곳니 연타로 전방을 찢습니다."
      },
      "tigerRend": {
        "name": "맹호 찢기",
        "desc": "날카로운 호랑이 발톱의 궤적으로 앞의 적을 찢습니다."
      },
      "tigerQuake": {
        "name": "백호 진각",
        "desc": "땅을 짓밟아 충격파를 터뜨리고 적 무리를 무너뜨립니다."
      },
      "tigerGuard": {
        "name": "투왕 위압",
        "desc": "야수의 위압으로 주변 적에게 피해와 둔화를 겁니다."
      },
      "flameSpark": {
        "name": "화염 점화",
        "desc": "가까운 적을 짧은 화염 폭발로 태웁니다."
      },
      "flameBolt": {
        "name": "화염구",
        "desc": "가장 가까운 적을 향해 불타는 화염구를 발사합니다."
      },
      "flameArc": {
        "name": "화염 호월",
        "desc": "부채꼴 화염 검기로 전방의 적을 쓸어냅니다."
      },
      "flameMeteor": {
        "name": "유성 낙인",
        "desc": "적 무리에 유성 문장을 폭발시켜 광역 피해를 줍니다."
      },
      "flameInferno": {
        "name": "화염 장막",
        "desc": "주변을 불길로 덮어 적에게 피해와 둔화를 남깁니다."
      },
      "sanctuaryStrike": {
        "name": "성역 타격",
        "desc": "정화의 힘을 담은 짧은 타격으로 가까운 적을 밀어냅니다."
      },
      "sanctuaryOrb": {
        "name": "성역 파동",
        "desc": "주변에 정화 파동을 펼쳐 적을 늦추고 자신을 회복합니다."
      },
      "sanctuaryArc": {
        "name": "정화의 호",
        "desc": "전방에 정화의 호선을 그어 적을 베어냅니다."
      },
      "sanctuarySeal": {
        "name": "성역 문장",
        "desc": "지면에 성역 문장을 펼쳐 적 무리에 범위 피해를 줍니다."
      },
      "sanctuaryField": {
        "name": "수호 결계",
        "desc": "수호 결계를 펼쳐 주변 적을 약화시키고 피해를 줍니다."
      }
    },
    "bosses": {
      "igris": "이그리스",
      "tusk": "터스크",
      "beru": "베루"
    },
    "passives": {
      "magnet": {
        "name": "자석",
        "desc": "픽업 범위 +25%"
      }
    }
  },
  "en": {
    "weapons": {
      "lightPierce": {
        "name": "Radiant Cut",
        "desc": "Slash nearby foes with a blade of light."
      },
      "lightLance": {
        "name": "Flash Thrust",
        "desc": "Pierce forward like a spear tip of light."
      },
      "lightCrescent": {
        "name": "Luminous Crescent",
        "desc": "Sweep a wide blade of light through enemies ahead."
      },
      "lightJudgment": {
        "name": "Judgment Fall",
        "desc": "Drop compressed light on enemy packs for area damage."
      },
      "lightSanctum": {
        "name": "Sacred Pressure",
        "desc": "Radiant pressure damages and slows nearby foes."
      },
      "tigerPalm": {
        "name": "White Tiger Palm",
        "desc": "Drive a heavy palm strike into nearby enemies."
      },
      "tigerFang": {
        "name": "White Tiger Fang",
        "desc": "Tear the front line with close-range fang strikes."
      },
      "tigerRend": {
        "name": "Tiger Rend",
        "desc": "Rake enemies ahead with claw-like arcs."
      },
      "tigerQuake": {
        "name": "Tiger Quake",
        "desc": "Stomp the ground to shatter packs with shockwaves."
      },
      "tigerGuard": {
        "name": "Beast Pressure",
        "desc": "Beastly pressure damages and slows nearby foes."
      },
      "flameSpark": {
        "name": "Flame Spark",
        "desc": "Burn nearby enemies with a short flame burst."
      },
      "flameBolt": {
        "name": "Fireball",
        "desc": "Hurl a burning fireball at the nearest enemy."
      },
      "flameArc": {
        "name": "Flame Arc",
        "desc": "Sweep a fan of flame across enemies ahead."
      },
      "flameMeteor": {
        "name": "Meteor Brand",
        "desc": "Detonate a meteor seal on enemy packs."
      },
      "flameInferno": {
        "name": "Flame Veil",
        "desc": "Cloak the area in fire to damage and slow foes."
      },
      "sanctuaryStrike": {
        "name": "Sanctuary Strike",
        "desc": "Push nearby foes back with a purifying strike."
      },
      "sanctuaryOrb": {
        "name": "Sanctuary Pulse",
        "desc": "Spread a cleansing pulse that slows foes and heals you."
      },
      "sanctuaryArc": {
        "name": "Purifying Arc",
        "desc": "Draw a purifying arc through enemies ahead."
      },
      "sanctuarySeal": {
        "name": "Sanctuary Seal",
        "desc": "Place a holy seal that damages enemy packs."
      },
      "sanctuaryField": {
        "name": "Guardian Ward",
        "desc": "Raise a ward that weakens and damages nearby foes."
      }
    },
    "bosses": {
      "igris": "Igris",
      "tusk": "Tusk",
      "beru": "Beru"
    },
    "passives": {
      "magnet": {
        "name": "Magnet",
        "desc": "Pickup range +25%"
      }
    }
  },
  "ja": {
    "weapons": {
      "lightPierce": {
        "name": "光裂き",
        "desc": "光の刃で近くの敵を素早く斬ります。"
      },
      "lightLance": {
        "name": "閃光突き",
        "desc": "光の槍先のように前方を貫きます。"
      },
      "lightCrescent": {
        "name": "光輝の斬撃",
        "desc": "前方に広い光の剣気を振るいます。"
      },
      "lightJudgment": {
        "name": "審判の落光",
        "desc": "敵集団に圧縮した光を落として範囲ダメージ。"
      },
      "lightSanctum": {
        "name": "聖光圧",
        "desc": "輝く威圧で周囲の敵にダメージと減速。"
      },
      "tigerPalm": {
        "name": "白虎掌打",
        "desc": "近い敵に重い掌打を叩き込みます。"
      },
      "tigerFang": {
        "name": "白虎の牙",
        "desc": "近距離の牙連撃で前方を裂きます。"
      },
      "tigerRend": {
        "name": "猛虎裂き",
        "desc": "鋭い爪の軌跡で前の敵を裂きます。"
      },
      "tigerQuake": {
        "name": "白虎震脚",
        "desc": "大地を踏み衝撃波で敵集団を崩します。"
      },
      "tigerGuard": {
        "name": "闘王威圧",
        "desc": "獣の威圧で周囲の敵にダメージと減速。"
      },
      "flameSpark": {
        "name": "炎の点火",
        "desc": "近い敵を短い火炎爆発で燃やします。"
      },
      "flameBolt": {
        "name": "火球",
        "desc": "最寄りの敵へ燃える火球を放ちます。"
      },
      "flameArc": {
        "name": "炎の弧月",
        "desc": "扇状の炎剣気で前方の敵を薙ぎ払います。"
      },
      "flameMeteor": {
        "name": "流星烙印",
        "desc": "敵集団に流星の印を爆発させます。"
      },
      "flameInferno": {
        "name": "炎の帳",
        "desc": "周囲を炎で覆いダメージと減速を与えます。"
      },
      "sanctuaryStrike": {
        "name": "聖域打撃",
        "desc": "浄化の力で近い敵を押し返します。"
      },
      "sanctuaryOrb": {
        "name": "聖域波動",
        "desc": "浄化波動で敵を遅らせ自分を回復します。"
      },
      "sanctuaryArc": {
        "name": "浄化の弧",
        "desc": "前方に浄化の弧を描き敵を斬ります。"
      },
      "sanctuarySeal": {
        "name": "聖域紋章",
        "desc": "地面に聖域紋章を展開し範囲ダメージ。"
      },
      "sanctuaryField": {
        "name": "守護結界",
        "desc": "守護結界で周囲の敵を弱体化しつつダメージ。"
      }
    },
    "bosses": {
      "igris": "イグリス",
      "tusk": "タスク",
      "beru": "ベル"
    },
    "passives": {
      "magnet": {
        "name": "磁石",
        "desc": "ピックアップ範囲 +25%"
      }
    }
  }
};
  for (const lang of Object.keys(extra)) {
    if (!TEXTS[lang]) continue;
    const src = extra[lang];
    for (const [key, val] of Object.entries(src)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        TEXTS[lang][key] = { ...(TEXTS[lang][key] || {}), ...val };
      } else {
        TEXTS[lang][key] = val;
      }
    }
  }
}

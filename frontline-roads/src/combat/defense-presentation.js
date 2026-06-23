import { BUILD_RANGE_METERS, DEFENSE_DEFINITIONS } from './definitions.js';

const percent = value => `${Math.round(value * 100)}%`;
const seconds = value => `${Number(value).toFixed(value < 10 ? 1 : 0)}秒`;

const TEXT = Object.freeze({
  barrier: {
    role: '経路制御',
    summary: '道路を封鎖し、敵部隊の進行経路を変える防衛設備です。',
    effect: '通行可能な別経路がある敵は迂回します。工兵などに破壊されるため、攻撃設備と組み合わせて使用します。',
    placement: '建設可能範囲内の道路上へ設置します。'
  },
  gun: {
    role: '単体攻撃',
    summary: '射程内で最も近い敵を継続攻撃する基本防衛塔です。',
    effect: '短い再装填で単体へ安定した損害を与えます。敵が長く射程内に留まる交差点が有効です。',
    placement: '建設可能範囲内の交差点へ設置します。'
  },
  mortar: {
    role: '範囲攻撃',
    summary: '敵が密集した地点を狙い、爆発範囲内の複数目標へ攻撃します。',
    effect: '中心目標へ最大ダメージ、周辺へ減衰ダメージを与えます。同時命中数には上限があり、防壁や減速設備の後方が有効です。',
    placement: '建設可能範囲内の交差点へ設置します。'
  },
  slow: {
    role: '減速支援',
    summary: '射程内の複数の敵を減速させ、ほかの設備が攻撃できる時間を延ばします。',
    effect: '対象へ小ダメージと一定時間の移動速度低下を与えます。攻撃塔の射程が重なる地点で効果が高まります。',
    placement: '建設可能範囲内の交差点へ設置します。'
  },
  relay: {
    role: '自動修復',
    summary: '射程内で損傷が最も大きい防衛設備を自動修復します。',
    effect: '修復時には対象設備に応じた資源を消費します。前線設備を範囲内へ収める配置が必要です。',
    placement: '建設可能範囲内の交差点へ設置します。'
  }
});

export function defensePresentation(type, definition = DEFENSE_DEFINITIONS[type]) {
  const text = TEXT[type];
  if (!text || !definition) return null;
  const metrics = [];
  if (type === 'barrier') {
    metrics.push(['HP', String(definition.hp)], ['BUILD', `${BUILD_RANGE_METERS}m`]);
  } else if (type === 'gun') {
    metrics.push(['RANGE', `${definition.range}m`], ['DAMAGE', String(definition.damage)], ['RELOAD', seconds(definition.cooldown)]);
  } else if (type === 'mortar') {
    metrics.push(['RANGE', `${definition.range}m`], ['DAMAGE', String(definition.damage)], ['BLAST', `${definition.blastRadius}m`], ['TARGETS', String(definition.maxTargets)], ['SPLASH', percent(definition.splashMultiplier)]);
  } else if (type === 'slow') {
    metrics.push(['RANGE', `${definition.range}m`], ['SLOW', percent(definition.slow)], ['TARGETS', String(definition.maxTargets)]);
  } else if (type === 'relay') {
    metrics.push(['RANGE', `${definition.range}m`], ['TOWER', `+${definition.repairTower}`], ['WALL', `+${definition.repairBarrier}`]);
  }
  return { ...text, metrics };
}

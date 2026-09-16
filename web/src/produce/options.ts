import type {PersonMask, ThemeMotion} from '../types';

export const DECK_KIND_OPTIONS = [
  {id: 'mirror', name: '逐句对照'},
  {id: 'points', name: '要点卡'},
  {id: 'steps', name: '步骤条'},
  {id: 'stats', name: '数据卡'},
  {id: 'compare', name: '对比卡'},
  {id: 'quote', name: '金句条'},
  {id: 'chart', name: '趋势图'},
  {id: 'timeline', name: '时间轴'},
  {id: 'auto', name: 'AI 混排'},
];

export const BEAT_KIND_OPTIONS = [
  {id: 'points', name: '要点 · 一条一条列'},
  {id: 'steps', name: '步骤 · 带序号'},
  {id: 'stats', name: '数据 · 放大数字'},
  {id: 'compare', name: '对比 · 左右两栏'},
  {id: 'quote', name: '金句 · 只放一句'},
  {id: 'chart', name: '趋势 · 折线'},
  {id: 'timeline', name: '时间轴 · 节点'},
];

export const REVEAL_OPTIONS = [
  {id: 'stagger', name: '逐条出现'},
  {id: 'fade', name: '整页淡入'},
  {id: 'draw', name: '画出图表'},
  {id: 'count', name: '数字跳动'},
];

export const REVEAL_IDS = REVEAL_OPTIONS.map((item) => item.id);

export function defaultReveal(kind: string, fallback = 'stagger') {
  if (kind === 'chart' || kind === 'timeline') return 'draw';
  if (kind === 'stats') return 'count';
  if (kind === 'quote' || kind === 'compare') return 'fade';
  return fallback;
}

export const MOTION_PACK_OPTIONS = [
  {id: 'auto', name: 'AI 按效果决定'},
  {id: 'knowledge', name: '知识干货'},
  {id: 'news', name: '资讯快报'},
  {id: 'life', name: '轻松生活'},
  {id: 'tech', name: '科技感'},
  {id: 'education', name: '课堂板书'},
  {id: 'business', name: '商务金'},
  {id: 'custom', name: '自定义'},
];

export const ORIENTATION_OPTIONS = [
  {id: 'portrait', name: '竖屏 9:16'},
  {id: 'landscape', name: '横屏 16:9'},
];

export const PRESET_OPTIONS = [
  {id: 'standard', name: '标准成片 · 1080p'},
  {id: 'fast', name: '速度优先 · 720p'},
];

export const THEME_MOTION_OPTIONS: Array<{id: ThemeMotion; name: string}> = [
  {id: 'auto', name: '跟主题（推荐）'},
  {id: 'pulse', name: '呼吸光'},
  {id: 'drift', name: '漂移光晕'},
  {id: 'scan', name: '扫描线'},
  {id: 'none', name: '不要动效'},
];

export const ENTER_FX_OPTIONS = [
  {id: 'fade_in', name: '淡入'},
  {id: 'slide_up', name: '从下向上'},
  {id: 'slide_down', name: '从上向下'},
  {id: 'slide_left', name: '从右向左'},
  {id: 'slide_right', name: '从左向右'},
  {id: 'scale_in', name: '缩放进入'},
  {id: 'spring_pop', name: '弹簧弹出'},
  {id: 'bounce', name: '弹跳'},
  {id: 'typewriter', name: '打字机'},
  {id: 'word_reveal', name: '逐词出现'},
  {id: 'char_reveal', name: '逐字出现'},
  {id: 'blur_reveal', name: '模糊变清晰'},
  {id: 'glitch_text', name: '故障文字'},
  {id: 'shake', name: '震动'},
  {id: 'underline_reveal', name: '下划线'},
  {id: 'marker_highlight', name: '荧光笔'},
];

export const EXIT_FX_OPTIONS = [
  {id: 'fade_out', name: '淡出'},
  {id: 'scale_out', name: '缩放退出'},
  {id: 'slide_up', name: '向上退出'},
  {id: 'slide_down', name: '向下退出'},
  {id: 'slide_left', name: '向左退出'},
  {id: 'slide_right', name: '向右退出'},
];

export const KEYWORD_FX_OPTIONS = [
  {id: 'keyword_pop', name: '关键词弹出'},
  {id: 'keyword_pulse', name: '关键词脉冲'},
];

export const PERSON_MASK_OPTIONS: Array<{id: PersonMask; name: string}> = [
  {id: 'theme', name: '不用人像'},
  {id: 'cutout', name: '椭圆挖空，露出背景'},
  {id: 'square', name: '方形挖空，露出背景'},
  {id: 'chroma', name: '纯色轮廓抠像，叠到背景上'},
];

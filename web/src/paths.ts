export const PATH = {
  input: '/input',
  transcript: '/transcript',
  script: '/script',
  deck: '/deck',
  produce: '/produce',
  publish: '/publish',
  voices: '/voices',
  library: '/library',
  history: '/history',
  assets: '/assets',
  settings: '/settings',
} as const;

export const STUDIO_STEPS = [
  {path: PATH.input, label: '输入'},
  {path: PATH.transcript, label: '原文'},
  {path: PATH.script, label: '口播稿'},
  {path: PATH.deck, label: '展示稿'},
  {path: PATH.produce, label: '成片'},
  {path: PATH.publish, label: '发布'},
] as const;

export type StudioPath = (typeof STUDIO_STEPS)[number]['path'];

export function isStudioPath(pathname: string): pathname is StudioPath {
  return STUDIO_STEPS.some((item) => item.path === pathname);
}

export function studioStepFromPath(pathname: string) {
  return STUDIO_STEPS.findIndex((item) => item.path === pathname);
}

export function studioPathFromStep(step: number): StudioPath {
  return STUDIO_STEPS[step]?.path ?? PATH.input;
}

export function settingsPath(focus: 'llm' | 'components' | '' = '') {
  return focus ? `${PATH.settings}?focus=${focus}` : PATH.settings;
}

export const SceneKeys = {
  BOOT: 'Boot',
  MENU: 'Menu',
  GAME: 'Game',
  PAUSE: 'Pause',
  GAME_OVER: 'GameOver',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];

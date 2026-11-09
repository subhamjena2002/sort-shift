import Phaser from 'phaser';
import { startupAssets } from '../assets/assetManifest';
import type { Orientation } from '../ui/layout';
import { generateSharedTextures } from '../ui/textures';
import { SceneKeys } from './SceneKeys';

/** Loads the rendered art, generates fallback textures, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.BOOT);
  }

  preload(): void {
    const orientation: Orientation = this.scale.height > this.scale.width ? 'portrait' : 'landscape';
    for (const asset of startupAssets(orientation)) this.load.image(asset.key, asset.path);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`Missing art "${file.key}" (${file.src}). Using its generated fallback.`);
    });
  }

  create(): void {
    generateSharedTextures(this);
    this.scene.start(SceneKeys.MENU);
  }
}

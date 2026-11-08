import Phaser from 'phaser';
import { generateSharedTextures } from '../ui/textures';
import { SceneKeys } from './SceneKeys';

/** Generates the shared placeholder textures, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.BOOT);
  }

  create(): void {
    generateSharedTextures(this);
    this.scene.start(SceneKeys.MENU);
  }
}

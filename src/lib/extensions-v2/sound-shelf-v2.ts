import {
  createSoundShelfV2Definition,
  registerSoundShelfV2Handlers,
  SOUND_SHELF_V2_ID,
} from "@foleyard/sound-shelf-v2";

import { getV2Registry, getAppV2Host, registerV2Extension } from "./host";

/**
 * Sound Shelf v2 production registration (Application context, S2 #177).
 *
 * Bundled internal port: registers the definition and handlers on the
 * process-wide app host exactly once. Registration never enables
 * (disabled by default; explicit enable/disable through the generic
 * extensions PATCH route) and never approves permissions (deny by
 * default). No auto-migration from v1: the v1 Sound Shelf keeps its
 * own settings namespace and behavior untouched, and the v2 shelf
 * store starts empty under `v2shelf:sound-shelf-v2`.
 */

let registered = false;

export function ensureSoundShelfV2Registered(): void {
  if (registered) return;
  registered = true;
  if (!getV2Registry().get(SOUND_SHELF_V2_ID)) {
    registerV2Extension(createSoundShelfV2Definition());
  }
  registerSoundShelfV2Handlers(getAppV2Host());
}

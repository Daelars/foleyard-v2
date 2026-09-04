import { expect, it, vi } from "vitest";
vi.mock("@/lib/database-path",()=>({getDatabasePath:()=>":memory:",ensureDesktopDatabaseInitialized:()=>{}}));
import { sqlite } from "../connection";
import { getAppServices } from "@/lib/composition-root";
import { getFileById } from "../file-repository";
import { getExtensionSettingValue, setExtensionSettingValue } from "@/lib/extensions/settings-store";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";
import { getRecentMakePackFileIds, recordRecentMakePackFile } from "@/lib/extensions/make-pack-recent-store";
it("shares committed writes between extension services and route repositories",()=>{
  const services=getAppServices();sqlite.prepare("INSERT INTO files (id,path,filename) VALUES (?,?,?)").run("shared","/shared.wav","shared.wav");
  services.fileRepository.toggleFavorite("shared");expect(getFileById("shared")?.isFavorite).toBe(true);
  expect(sqlite.pragma("busy_timeout")).toEqual([{timeout:5000}]);
});
it("round-trips all extension stores through their existing keys and JSON shapes",()=>{
  setExtensionSettingValue("drop-rules","rename-pattern","{name}{ext}");expect(getExtensionSettingValue("drop-rules","rename-pattern",null)).toBe("{name}{ext}");
  new DbSoundShelfStore().setFileIds(["one","two"]);expect(new DbSoundShelfStore().getFileIds()).toEqual(["one","two"]);
  recordRecentMakePackFile("one");recordRecentMakePackFile("two");recordRecentMakePackFile("one");expect(getRecentMakePackFileIds()).toEqual(["one","two"]);
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("extension:sound-shelf:items")).toEqual({value:JSON.stringify({fileIds:["one","two"]})});
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("extension:make-pack:recent")).toEqual({value:JSON.stringify({fileIds:["one","two"]})});
});

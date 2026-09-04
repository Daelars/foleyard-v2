const fs = require("fs");
const path = require("path");

function createGrantedPathRegistry() {
  const directories = new Set();

  return {
    grant(directoryPath) {
      try {
        directories.add(fs.realpathSync(directoryPath));
        return true;
      } catch {
        return false;
      }
    },
    resolve(candidatePath) {
      try {
        const candidate = fs.realpathSync(candidatePath);
        for (const directory of directories) {
          const relative = path.relative(directory, candidate);
          if (
            relative === "" ||
            (relative !== ".." &&
              !relative.startsWith(`..${path.sep}`) &&
              !path.isAbsolute(relative))
          ) {
            return candidate;
          }
        }
      } catch {}

      return null;
    },
  };
}

module.exports = { createGrantedPathRegistry };

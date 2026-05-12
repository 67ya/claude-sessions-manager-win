import * as os from "os";
import * as path from "path";

export const IS_WINDOWS = process.platform === "win32";
export const HOME_DIR = os.homedir();
export const CLAUDE_DIR = path.join(HOME_DIR, ".claude");

// The Claude SDK stores sessions under ~/.claude/projects/<slugified-home>
// On Linux: -home-ctyun; on Windows: C--Users-94941
// Path separators (:\ or /) become dashes
const homeSlug = HOME_DIR
  .replace(/^[A-Za-z]:\\/, (drive) => drive.replace(":\\", "--")) // C:\ -> C--
  .replace(/\\/g, "-")
  .replace(/\//g, "-");
export const SESSIONS_DIR = path.join(CLAUDE_DIR, "projects", homeSlug);

export const METADATA_PATH = path.join(CLAUDE_DIR, "sessions-metadata.json");
export const USERS_PATH = path.join(CLAUDE_DIR, "claude-users.json");
export const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
export const CREDENTIALS_PATH = path.join(CLAUDE_DIR, ".credentials.json");
export const CLAUDE_JSON_PATH = path.join(CLAUDE_DIR, "claude.json");
export const PROFILES_DIR = path.join(CLAUDE_DIR, "profiles");
export const API_CONFIGS_PATH = path.join(HOME_DIR, ".claude-api-configs.json");

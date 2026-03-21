/**
 * 所有 Skill 工具
 */

import { SkillListTool } from "./skill-list.js";
import { SkillSearchTool } from "./skill-search.js";
import { SkillReadTool } from "./skill-read.js";
import { SkillExecuteTool } from "./skill-execute.js";
import { SkillCreateTool } from "./skill-create.js";
import { SkillDeleteTool } from "./skill-delete.js";
import { SkillAddTool } from "./skill-add.js";

export const skillTools = [
  new SkillListTool(),
  new SkillSearchTool(),
  new SkillReadTool(),
  new SkillExecuteTool(),
  new SkillCreateTool(),
  new SkillDeleteTool(),
  new SkillAddTool(),
];

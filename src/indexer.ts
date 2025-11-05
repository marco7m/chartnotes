import { App, TFile, parseYaml } from "obsidian";
import type { IndexedNote } from "./types";

export class PropChartsIndexer {
  private app: App;
  private index: Map<string, IndexedNote> = new Map();

  constructor(app: App) {
    this.app = app;
  }

  async buildIndex() {
    this.index.clear();
    const files = this.app.vault.getMarkdownFiles();
    for (const f of files) {
      await this.updateFile(f);
    }
  }

  async fullReindex() {
    await this.buildIndex();
  }

  getAll(): IndexedNote[] {
    return Array.from(this.index.values());
  }

  async updateFile(file: TFile) {
    if (file.extension !== "md") return;

    const props: Record<string, any> = {};

    try {
      // 1) frontmatter direto do arquivo (sempre o valor real salvo)
      const content = await this.app.vault.read(file);
      const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
      if (m) {
        const fm = parseYaml(m[1]) || {};
        if (fm && typeof fm === "object") {
          for (const [k, v] of Object.entries(fm)) {
            if (k === "position") continue;
            props[k] = v;
          }
        }
      }

      // 2) tags do corpo se não houver `tags` no frontmatter
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.tags && !props["tags"]) {
        props["tags"] = cache.tags.map((t) => t.tag.replace(/^#/, ""));
      }
    } catch (e) {
      console.error("Chart Notes: erro ao indexar", file.path, e);
    }

    this.index.set(file.path, {
      path: file.path,
      props,
    });
  }

  removeFile(file: TFile) {
    this.index.delete(file.path);
  }
}

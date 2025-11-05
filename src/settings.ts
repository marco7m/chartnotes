// src/settings.ts

import { App, PluginSettingTab, Setting } from "obsidian";

export interface PropChartsSettings {
  /**
   * Pastas padrão para buscar notas quando o bloco não especifica source.paths.
   * Ex.: ["."] → tudo; ["TaskNotes/"] → só pasta de tasks.
   */
  defaultPaths: string[];

  /**
   * Limite de notas indexadas, para evitar travar em cofres gigantes.
   * (Ainda não está sendo usado no indexer, mas já fica pronto.)
   */
  maxNotes: number;

  /**
   * Futuro: ler inline fields (key:: value) além do frontmatter YAML.
   * No momento, só aciona um reindex quando muda.
   */
  enableInlineFields: boolean;
}

export const DEFAULT_SETTINGS: PropChartsSettings = {
  defaultPaths: ["."],
  maxNotes: 20000,
  enableInlineFields: false,
};

export class PropChartsSettingTab extends PluginSettingTab {
  plugin: any;

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Chart Notes" });

    // Pastas padrão
    new Setting(containerEl)
      .setName("Pastas padrão")
      .setDesc("Usadas quando o bloco não especificar source.paths.")
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.defaultPaths.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.defaultPaths = value
              .split("\n")
              .map((v: string) => v.trim())
              .filter((v: string) => v);
            await this.plugin.saveSettings();
          });
      });

    // Limite de notas
    new Setting(containerEl)
      .setName("Limite de notas indexadas")
      .setDesc("Evita travar em cofres gigantes.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.maxNotes))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.maxNotes = n;
              await this.plugin.saveSettings();
            }
          });
      });

    // Inline fields (ainda não implementado de fato no indexer)
    new Setting(containerEl)
      .setName("Ler inline fields (key:: value)")
      .setDesc("Desmarque para máximo desempenho. (Requer reindex)")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableInlineFields)
          .onChange(async (value) => {
            this.plugin.settings.enableInlineFields = value;
            await this.plugin.saveSettings();
            // reindex completo quando essa flag muda
            if (this.plugin.indexer?.buildIndex) {
              await this.plugin.indexer.buildIndex();
            }
          });
      });
  }
}

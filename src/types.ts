// src/types.ts

export type ChartType =
  | "bar"
  | "line"
  | "stacked-area"
  | "pie"
  | "scatter"
  | "stacked-bar"
  | "table"
  | "gantt"
  | "metric";


export interface ChartSpec {
  type: ChartType;
  source?: {
    paths?: string[];
    tags?: string[];
    where?: string[];
  };
  encoding: {
    x?: string;
    y?: string;
    series?: string;   // usado pra cor / séries em bar/line/scatter/etc.

    // Gantt
    start?: string;    // campo início (data)
    end?: string;      // campo fim (data)
    duration?: string; // campo de duração em minutos (ex: timeEstimate)
    due?: string;      // campo de deadline, se existir
    label?: string;    // texto na coluna esquerda
    group?: string;    // NOVO: agrupar linhas (ex: projects)
  };
  aggregate?: {
    y?: "sum" | "avg" | "min" | "max" | "count";
  };
  sort?: {
    x?: "asc" | "desc";
  };
  options?: {
    title?: string;
    background?: string;
    drilldown?: boolean;
    tooltipFields?: string[]; // NOVO: campos extras no tooltip + modal
    // Metric/Indicator widget options
    metricLabel?: string;
    metricLabelPosition?: string;
    metricDecimals?: string;
    metricPrefix?: string;
    metricSuffix?: string;
    metricColor?: string;
  };
}


export interface IndexedNote {
  path: string;
  props: Record<string, any>;
}

export interface QueryResultRow {
  x: string | number | Date;
  y: number;
  notes: string[];
  series?: string;

  // para gantt
  start?: Date;
  end?: Date;
  due?: Date;

  // tabela
  props?: Record<string, any>;
}

export interface QueryResult {
  rows: QueryResultRow[];
  xField?: string;
  yField?: string;
}

// SETTINGS (como você já tinha)
import { App, PluginSettingTab, Setting } from "obsidian";

export interface PropChartsSettings {
  defaultPaths: string[];
  maxNotes: number;
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

    new Setting(containerEl)
      .setName("Ler inline fields (key:: value)")
      .setDesc("Desmarque para máximo desempenho.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableInlineFields)
          .onChange(async (value) => {
            this.plugin.settings.enableInlineFields = value;
            await this.plugin.saveSettings();
            // se quiser, depois implementamos fullReindex aqui
            if (this.plugin.indexer?.buildIndex) {
              await this.plugin.indexer.buildIndex();
            }
          });
      });
  }
}


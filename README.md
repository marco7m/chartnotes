# Chart Notes – Guia de Uso

Este plugin permite criar gráficos a partir dos **properties/YAML** das notas no Obsidian usando blocos de código:

```chart
# tudo aqui dentro é YAML
type: bar
source:
  paths: ["TaskNotes/"]
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Tasks por status"
````

Qualquer lugar que você puder escrever markdown, você pode colocar um bloco ` ```chart ` e o plugin renderiza o gráfico.

---

## 1. Estrutura básica do bloco

Todo gráfico segue a mesma estrutura geral:

```yaml
type: <tipo>
source:
  paths: [...]
  tags: [...]
  where:
    - "<condição>"
    - "<condição 2>"
encoding:
  x: <campo>
  y: <campo>
  series: <campo>  # opcional
aggregate:
  y: sum|avg|min|max|count
  cumulative: true|false   # opcional (line/area)
  rolling: "7d"            # opcional (line/area)
sort:
  x: asc|desc
options:
  title: "Título"
  background: "#ffffff"
  # outros campos específicos (gantt, tabela, etc.)
```

### Campos principais

- **`type`** – tipo do gráfico:
    
    - `bar`, `line`, `area`, `pie`, `scatter`, `stacked-bar`, `table`, `gantt`
        
- **`source`** – de onde vêm as notas
    
- **`encoding`** – mapeia campos das notas para eixos / cores
    
- **`aggregate`** – como agrupar/somar dados
    
- **`sort`** – ordenação dos pontos
    
- **`options`** – visual / comportamento
    

---

## 2. `source`: quais notas entram no gráfico

### 2.1. `paths`

Filtra por caminho de arquivo:

```yaml
source:
  paths: ["TaskNotes/"]
```

- `"TaskNotes/"` → todas as notas dentro dessa pasta (recursivo)
    
- Você pode passar vários caminhos:
    
    ```yaml
    source:
      paths:
        - "TaskNotes/"
        - "Projects/"
    ```
    

### 2.2. `tags`

Filtra por tag (sem `#`):

```yaml
source:
  tags: ["tasknote"]
```

Você também pode combinar `paths` e `tags`:

- Se tiver **paths e tags**, uma nota entra se **bater em pelo menos um** (OR).
    

### 2.3. `where`: condições

Lista de condições em string. Exemplos:

#### Igualdade

```yaml
where:
  - "status == 'open'"
  - "priority == 'higher'"
```

#### Comparação numérica

```yaml
where:
  - "timeEstimate > 0"
  - "timeEstimate >= 60"
```

#### Intervalos de data (`between`)

```yaml
where:
  - "dateCreated between -30d and today"
  - "scheduled between 2025-10-01 and 2025-10-31"
  - "scheduled between -14d and 0"
```

Sintaxe suportada:

- datas absolutas: `2025-10-29`
    
- datas relativas:
    
    - `today` → hoje
        
    - `0` → hoje
        
    - `-7d` → 7 dias para trás
        
    - `+10d` → 10 dias para frente
        
    - `-30d` → 30 dias para trás
        
- `between A and B` leva em conta o **dia inteiro**
    

Exemplo usado:

```yaml
where:
  - "scheduled between -30d and 0"
```

---

## 3. `encoding`: campos → eixos / cores

O `encoding` diz **como as propriedades da nota viram visual**.

### 3.1. Campos gerais (para bar/line/area/stacked-bar/pie/scatter)

- `x` – campo usado no **eixo X** ou categoria
    
- `y` – valor numérico ou campo a ser contado
    
- `series` – separa linhas / cores por categoria (status, prioridade…)
    

Exemplos:

```yaml
encoding:
  x: status
  y: status
```

Com:

```yaml
aggregate:
  y: count
```

→ conta quantas notas há por `status`.

```yaml
encoding:
  x: scheduled
  y: timeEstimate
```

→ soma (ou o que você definir em `aggregate.y`) dos `timeEstimate` por dia.

```yaml
encoding:
  x: scheduled
  y: timeEstimate
  series: status
```

→ tempo estimado por dia, **quebrado por status** (cada status é uma cor/linha/grupo).

---

### 3.2. `encoding` para `gantt`

Gantt tem campos especiais:

```yaml
encoding:
  end: scheduled         # fim planejado (data)
  duration: timeEstimate # em minutos
  start: startDate       # opcional, se tiver, ignora duration
  due: due               # opcional, deadline
  group: projects        # agrupa visualmente (ex.: projeto)
  label: name            # texto à esquerda (se array, pega o primeiro)
  series: status         # cor da barra
```

Regra:

- **`end` é obrigatório** (normalmente `scheduled`)
    
- Se tiver **`start`**, ele manda e **ignora `duration`**
    
- Se não tiver `start`, mas tiver `duration`, usa:
    
    > start = end – duration (em minutos)
    
- `due` desenha uma linha de deadline
    
- `group` organiza por projeto (ou qualquer campo) visualmente
    
- `series` pinta as barras por status (ou outra categoria)
    

---

### 3.3. `encoding` para `table`

A tabela usa o `source` para buscar as notas e mostra as `props`.

Você pode sugerir colunas via `options.tableColumns`:

```yaml
type: table
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled between -5d and -1d"
encoding:
  x: status
  y: priority
options:
  title: "Últimos dias"
  tableColumns: ["status","priority","scheduled","projects"]
```

---

## 4. `aggregate`: como agrupar / somar

### 4.1. `aggregate.y`

Valores possíveis:

- `sum` – soma
    
- `avg` – média
    
- `min` – mínimo
    
- `max` – máximo
    
- `count` – quantidade de notas
    

Exemplo – contagem por status:

```yaml
encoding:
  x: status
  y: status
aggregate:
  y: count
```

Exemplo – soma de estimativas por dia:

```yaml
encoding:
  x: scheduled
  y: timeEstimate
aggregate:
  y: sum
```

---

### 4.2. `cumulative` (linha cumulativa)

Disponível para `type: line` e `type: area`:

```yaml
aggregate:
  y: count
  cumulative: true
```

Semântica:

> Em vez de mostrar “quantas tasks em cada dia”, mostra  
> “quantas tasks eu já tinha até aquele dia” (soma acumulada).

Exemplo:

```yaml
type: line
source:
  paths: ["TaskNotes/"]
  where:
    - "dateCreated between -30d and today"
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
  cumulative: true
sort:
  x: asc
options:
  title: "Tasks criadas (30 dias, acumulado)"
  background: "#ffffff"
```

> Dica: a ordem (`sort.x`) importa. A soma é feita **na ordem escolhida**.

---

### 4.3. `rolling` (média móvel)

Também para `line`/`area`:

```yaml
aggregate:
  y: sum
  rolling: "7d"
```

ou

```yaml
aggregate:
  y: sum
  rolling: 7
```

Semântica:

> Para cada ponto, o valor vira a média dos últimos N pontos (por série).  
> Útil para suavizar variação de dia a dia.

Exemplo:

```yaml
type: line
source:
  paths: ["TaskNotes/"]
encoding:
  x: scheduled
  y: timeEstimate
  series: status
aggregate:
  y: sum
  rolling: "7d"
options:
  title: "Tempo estimado (média móvel 7d por status)"
  background: "#ffffff"
```

---

## 5. `sort`: ordenação

Hoje temos:

```yaml
sort:
  x: asc   # ou desc
```

- Afeta apenas o eixo X (datas, prioridades, etc.)
    
- Para gráficos cumulativos/rolling, a ordem é usada para:
    
    - calcular o acumulado/rolling
        
    - desenhar o gráfico
        

Exemplo:

```yaml
sort:
  x: asc   # timeline normal
```

---

## 6. `options`: aparência e comportamento

Campos principais:

```yaml
options:
  title: "Título do gráfico"
  background: "#ffffff"
  drilldown: true|false   # se clique abre lista de notas
  editable: true|false    # Gantt: se pode editar na modal
```

- `title` – aparece acima do gráfico
    
- `background` – cor de fundo do gráfico (ex.: `"#ffffff"` no tema escuro)
    
- `drilldown` – se verdadeiro, clicar em um ponto/barra mostra a lista de notas
    
- `editable` (Gantt) – se verdadeiro, clicar em uma barra abre modal para ajustar datas/estimate
    

---

## 7. Interações no gráfico

### 7.1. Todos os gráficos (bar, line, area, pie, scatter, stacked-bar)

- **Hover (passar o mouse)**:
    
    - Aparece tooltip com:
        
        - título (categoria / série)
            
        - valor
            
        - quantidade de notas envolvidas
            
- **Clique em barra/ponto/fatia**:
    
    - Abre um painel embaixo com:
        
        - título do ponto
            
        - valor (y)
            
        - lista de notas (paths)
            
    - Clicar no nome da nota abre a nota no Obsidian (normalmente em nova aba)
        

### 7.2. Gantt

- **Barra**:
    
    - Hover: tooltip com nome da tarefa, datas de início/fim, estimate, due (se tiver)
        
    - Clique:
        
        - Abre **modal de edição**, com:
            
            - nome completo da nota (clicável)
                
            - campos para ajustar:
                
                - start
                    
                - end
                    
                - estimate
                    
                - due (se implementado)
                    
        - salvar → atualiza a nota (YAML) e o gráfico (pós refresh do markdown)
            
- **Nome da tarefa (label)**:
    
    - Hover: tooltip com nome completo
        
    - Clique: mesmo comportamento da barra (abre modal de edição)
        

---

## 8. Exemplos prontos (receitas)

### 8.1. Tasks por status

```chart
type: bar
source:
  paths: ["TaskNotes/"]
encoding:
  x: status
  y: status
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks por status"
```

---

### 8.2. Tasks por prioridade

```chart
type: bar
source:
  paths: ["TaskNotes/"]
encoding:
  x: priority
  y: priority
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks por prioridade"
```

---

### 8.3. Tasks abertas por prioridade

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "status == 'open'"
encoding:
  x: priority
  y: priority
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks abertas por prioridade"
```

---

### 8.4. Minutos estimados por dia

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "timeEstimate > 0"
encoding:
  x: scheduled
  y: timeEstimate
aggregate:
  y: sum
sort:
  x: asc
options:
  title: "Minutos estimados por dia"
```

---

### 8.5. Tasks criadas ao longo do tempo

```chart
type: line
source:
  paths: ["TaskNotes/"]
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks criadas ao longo do tempo"
  background: "#ffffff"
```

---

### 8.6. Tempo estimado (open) por prioridade

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "status == 'open'"
    - "timeEstimate > 0"
encoding:
  x: priority
  y: timeEstimate
aggregate:
  y: sum
sort:
  x: asc
options:
  title: "Tempo estimado (open) por prioridade"
```

---

### 8.7. Tasks de uma data específica

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled == '2025-10-29'"
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Tasks de 2025-10-29 por status"
```

---

### 8.8. Tempo estimado total por status

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "timeEstimate > 0"
encoding:
  x: status
  y: timeEstimate
aggregate:
  y: sum
options:
  title: "Tempo estimado total por status"
```

---

### 8.9. Dashboard de tasks (exemplo de “painel”)

#### Tasks por status

```chart
type: bar
source:
  tags: ["tasknote"]
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Tasks por status"
```

#### Tasks criadas ao longo do tempo

```chart
type: line
source:
  paths: ["TaskNotes/"]
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks criadas ao longo do tempo"
```

#### Tasks de hoje

```chart
type: bar
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled == 0"
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Tasks de hoje por status"
  background: "#ffffff"
```

#### Tasks criadas nos últimos 30 dias

```chart
type: line
source:
  paths: ["TaskNotes/"]
  where:
    - "dateCreated between -30d and today"
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks criadas (30 dias)"
  background: "#ffffff"
```

#### Tasks criadas (30 dias, acumulado)

```chart
type: line
source:
  paths: ["TaskNotes/"]
  where:
    - "dateCreated between -30d and today"
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
  cumulative: true
sort:
  x: asc
options:
  title: "Tasks criadas (30 dias, acumulado)"
  background: "#ffffff"
```

#### Tasks criadas (últimos 7 dias)

```chart
type: line
source:
  paths: ["TaskNotes/"]
  where:
    - "dateCreated between -7d and today"
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks criadas (últimos 7 dias)"
  background: "#ffffff"
```

#### Distribuição de status (30 dias)

```chart
type: pie
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled between -30d and 0"
encoding:
  x: status
  y: status
aggregate:
  y: count
options:
  title: "Distribuição de status (30 dias)"
  background: "#ffffff"
```

#### Stacked: prioridade por status (14d)

```chart
type: stacked-bar
source:
  tags: ["tasknote"]
  where:
    - "scheduled between -14d and 0"
encoding:
  x: status
  y: priority
  series: priority
aggregate:
  y: count
options:
  title: "Stacked: prioridade por status (14d)"
  background: "#ffffff"
```

#### Scatter: estimativa vs data (30d)

```chart
type: scatter
source:
  paths: ["TaskNotes/"]
  where:
    - "dateCreated between -30d and 0"
encoding:
  x: dateCreated   # vira timestamp
  y: timeEstimate  # precisa ser número
options:
  title: "Scatter: estimativa vs data (30d)"
  background: "#ffffff"
```

#### Área: tasks criadas (30d)

```chart
type: area
source:
  tags: ["tasknote"]
  where:
    - "dateCreated between -30d and 0"
encoding:
  x: dateCreated
  y: dateCreated
aggregate:
  y: count
sort:
  x: asc
options:
  title: "Tasks criadas (30d)"
  background: "#ffffff"
```

#### Tabela: últimos dias

```chart
type: table
source:
  paths: ["TaskNotes/"]
  where:
    - "scheduled between -5d and -1d"
encoding:
  x: status
  y: priority
options:
  title: "Últimos dias (tabela)"
  tableColumns: ["status","priority","scheduled","projects"]
```

#### Gantt: tasks (7 dias)

```chart
type: gantt
source:
  tags: ["tasknote"]
  where:
    - "scheduled > -7d"
encoding:
  end: scheduled         # fim planejado
  duration: timeEstimate # duração em minutos
  due: due               # opcional
  group: projects
  start: startDate
  label: name
  series: status         # cor
options:
  title: "Gantt – tasks (7 dias)"
  background: "#ffffff"
  editable: true
```



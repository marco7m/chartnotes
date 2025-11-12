# Guia de Testes - Chart Notes

Este guia explica como usar os testes unitários do projeto Chart Notes.

## 📋 Pré-requisitos

Os testes usam **Vitest**, um framework moderno e rápido para testes em TypeScript/JavaScript.

## 🚀 Como Rodar os Testes

### Instalar dependências (se ainda não instalou)
```bash
npm install
```

### Rodar todos os testes uma vez
```bash
npm test
```

### Rodar testes em modo watch (recomendado durante desenvolvimento)
```bash
npm run test:watch
```
Isso roda os testes automaticamente sempre que você salvar um arquivo.

### Rodar testes com cobertura
```bash
npm run test:coverage
```
Isso gera um relatório mostrando quais partes do código estão cobertas por testes.

## 📁 Estrutura dos Testes

Os testes estão organizados em arquivos na pasta `tests/`:

- `utils.test.ts` - Testes para funções utilitárias (parseDateLike, etc.)
- `query.test.ts` - Testes para funções de query e agregação
- `stacking.test.ts` - Testes para lógica de empilhamento (stacked area)
- `date-normalization.test.ts` - Testes para normalização de datas

## ✍️ Como Escrever Novos Testes

### Estrutura Básica

```typescript
import { describe, it, expect } from "vitest";

describe("nomeDaFuncao", () => {
  it("deve fazer algo específico", () => {
    // Arrange (preparar)
    const input = "valor de teste";
    
    // Act (executar)
    const result = minhaFuncao(input);
    
    // Assert (verificar)
    expect(result).toBe("resultado esperado");
  });
});
```

### Exemplos de Asserções

```typescript
// Igualdade
expect(result).toBe(5);
expect(result).toEqual({ a: 1, b: 2 });

// Valores booleanos
expect(result).toBe(true);
expect(result).toBeTruthy();
expect(result).toBeFalsy();

// Null/undefined
expect(result).toBeNull();
expect(result).toBeUndefined();
expect(result).toBeDefined();

// Números
expect(result).toBeGreaterThan(10);
expect(result).toBeLessThan(20);
expect(result).toBeCloseTo(3.14, 2); // para floats

// Strings
expect(result).toContain("substring");
expect(result).toMatch(/regex/);

// Arrays
expect(array).toHaveLength(3);
expect(array).toContain("item");

// Exceções
expect(() => funcaoQueLancaErro()).toThrow();
expect(() => funcaoQueLancaErro()).toThrow("mensagem de erro");
```

### Testando Funções Privadas

Se uma função é privada (não exportada), você tem duas opções:

1. **Extrair a função para um arquivo de utilitários** e exportá-la
2. **Copiar a função no arquivo de teste** (como fizemos com `parseDateLike`)

### Testando com Datas

```typescript
it("deve comparar datas corretamente", () => {
  const date1 = new Date("2024-01-15");
  const date2 = new Date("2024-01-20");
  
  expect(date1.getTime()).toBeLessThan(date2.getTime());
});
```

### Testando com Mocks (quando necessário)

```typescript
import { vi } from "vitest";

it("deve chamar função externa", () => {
  const mockFn = vi.fn();
  minhaFuncao(mockFn);
  expect(mockFn).toHaveBeenCalled();
});
```

## 🎯 Boas Práticas

1. **Um teste, uma coisa**: Cada teste deve verificar uma funcionalidade específica
2. **Nomes descritivos**: Use nomes que descrevam o que o teste verifica
3. **Arrange-Act-Assert**: Organize seus testes nessa ordem
4. **Teste casos extremos**: Valores zero, null, undefined, strings vazias
5. **Teste casos de erro**: O que acontece quando a entrada é inválida?

## 📊 Entendendo a Cobertura

Quando você roda `npm run test:coverage`, o Vitest gera um relatório mostrando:

- **Statements**: Quantas linhas de código foram executadas
- **Branches**: Quantos caminhos condicionais foram testados
- **Functions**: Quantas funções foram chamadas
- **Lines**: Quantas linhas foram executadas

A meta é ter alta cobertura, mas **100% não é sempre necessário**. Foque em testar:
- Funções críticas (lógica de negócio)
- Funções complexas (muitas condições)
- Funções que são fáceis de quebrar

## 🔍 Debugando Testes

Se um teste falhar, o Vitest mostra:
- Qual teste falhou
- O valor esperado vs. o valor recebido
- A linha onde o erro ocorreu

Para debugar, você pode usar `console.log` dentro dos testes:

```typescript
it("deve fazer algo", () => {
  const result = minhaFuncao(input);
  console.log("Resultado:", result); // Aparece no terminal
  expect(result).toBe(expected);
});
```

## 📚 Recursos Adicionais

- [Documentação do Vitest](https://vitest.dev/)
- [Guia de Testes em TypeScript](https://vitest.dev/guide/typescript.html)
- [Matchers do Vitest](https://vitest.dev/api/expect.html)

## ❓ Dúvidas?

Se tiver dúvidas sobre como testar algo específico, consulte a documentação do Vitest ou pergunte na issue do GitHub!


# Responsividade completa do Sigma Control

## Objetivo
Adaptar todas as telas e fluxos para celulares pequenos, celulares grandes, tablets, notebooks, desktops e telas ultrawide, preservando o visual e todas as funções existentes.

## Implementação
1. **Base responsiva única**
   - Consolidar as regras hoje espalhadas entre os estilos globais, removendo conflitos de tabelas, diálogos, cabeçalhos, espaçamentos e alvos de toque.
   - Garantir mídia fluida, textos longos quebráveis, filhos flexíveis encolhíveis e ausência de rolagem horizontal da página.
   - Manter conteúdo centralizado e com largura confortável em telas ultrawide.

2. **Estrutura e navegação**
   - Ajustar barra superior, menu lateral, menu inferior e gaveta mobile para áreas seguras, alturas pequenas e textos extensos.
   - Tornar a gaveta utilizável em celulares baixos e estreitos, com navegação rolável e botões confortáveis para toque.
   - Refinar os espaços do conteúdo nos breakpoints de celular, tablet e notebook.

3. **Todas as páginas e componentes**
   - Revisar cabeçalhos, grades, cartões, filtros, formulários, abas, tabelas, listas, gráficos, menus e janelas de cada rota.
   - Empilhar ações e campos quando necessário, permitir rolagem contida em dados largos e impedir cortes de texto ou controles.
   - Corrigir larguras e alturas rígidas que prejudiquem telas pequenas, sem reconstruir o design.

4. **Validação visual e funcional**
   - Percorrer todas as rotas acessíveis em 360×800, 480×900, 768×1024, 1280×800 e 1920×1080.
   - Verificar overflow horizontal, sobreposição, legibilidade, toque, abertura de menus/abas/janelas e navegação.
   - Corrigir regressões encontradas e confirmar compilação sem erros.

## Detalhes técnicos
- Breakpoints principais: 480, 640, 768, 1024, 1280 e 1536 px.
- Tabelas densas permanecerão completas dentro de regiões de rolagem horizontal; listas apropriadas continuarão usando cartões no mobile.
- Janelas terão largura limitada ao viewport e altura rolável, respeitando as áreas seguras do aparelho.
- A aplicação continuará usando os componentes e tokens visuais atuais; nenhuma função será removida.

# Sigma Control refeito do zero (telas e visual)

## Objetivo
Reescrever todas as páginas, menus e componentes com uma identidade visual nova, mantendo intactos os dados, o banco, as integrações (WhatsApp/Evolution, Sigma, MisticPay, Mercado Pago, Telegram) e todas as funções atuais.

## Nova identidade visual
- Proposta: "Grafite + Âmbar" — fundo grafite quente, superfícies em camadas, destaque âmbar/laranja suave, verde/amarelo/vermelho só para status.
- Tipografia: Sora (títulos) + Manrope (texto) + JetBrains Mono (números e códigos).
- Tema escuro padrão e tema claro completo; contraste AA em tudo.
- Logo e ícone da aba refeitos na nova paleta.

## O que será refeito (tudo de uma vez)
1. **Base**: tokens de cor, tipografia, espaçamento, sombras, raios e animações; consolidar os três arquivos de estilo atuais em um só, sem regras conflitantes.
2. **Estrutura**: menu lateral no computador, cabeçalho e barra inferior no celular, gaveta "Mais", busca global, troca de tema.
3. **Páginas públicas**: página inicial, login/cadastro, termos e privacidade.
4. **Páginas internas** (cada uma reescrita com cabeçalho, indicadores, filtros, listas/tabelas, estados de carregando/vazio/erro e janelas):
   Início, Clientes, Cobranças, Pedidos, WhatsApp, Atendimento automático, Cobrança automática, Modelos de mensagem, Painel Sigma, Recebimentos, Assinatura, Configurações, Administração.
5. **Componentes compartilhados**: cartões de indicador, tabela responsiva que vira cartões no celular, cabeçalho de página, barra de filtros, confirmação de exclusão, estados vazios.

## Cuidados para não ter erros
- Nenhuma função do servidor, tabela, regra de cobrança, webhook ou integração será alterada; as telas novas chamam exatamente as mesmas funções.
- Cada página reescrita mantém todas as ações existentes (lista conferida antes de reescrever).
- Verificação de tipos e compilação após cada página.
- Teste em navegador com conta de teste em 360, 768, 1280 e 1920 px: navegação, criação/edição de cliente, janelas, filtros, sem rolagem horizontal nem textos cortados.
- Conta de teste apagada ao final.

## Limites
- Dados, banco, integrações e regras de negócio permanecem como estão.
- Textos e nomes das áreas continuam em português e com os mesmos nomes atuais.

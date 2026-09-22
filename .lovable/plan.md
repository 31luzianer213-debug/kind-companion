# Organização do painel — plano antes das edições

Passei tela por tela do sistema. Abaixo está o que está bagunçado, confuso ou repetido, e o que proponho fazer.

## O que está errado hoje

### 1. Páginas escondidas que ninguém acha (5 telas fora do menu)
Existem 5 telas que não aparecem em nenhum menu — só dá para chegar nelas por links soltos:
- Indicadores (repete números que já estão no Painel)
- Atividades (histórico)
- Operação de clientes (repete a tela Clientes)
- Sincronização dos servidores (repete a tela Painel Sigma)
- Diagnóstico do WhatsApp (repete a tela WhatsApp)

Resultado: você tem duas versões da mesma coisa em vários assuntos.

### 2. A mesma configuração aparece em três lugares diferentes
- **Chave Pix e token do Mercado Pago**: pedidos em "Recebimentos (Pix)" e de novo dentro do "Robô WhatsApp". Se preencher em um e não no outro, dá confusão sobre qual vale.
- **Nome da revenda**: pedido em "Configurações" e de novo no "Robô WhatsApp".
- **Quando cobrar (dias antes/depois do vencimento)**: existe em "Configurações" (bloco "Régua de Cobrança") e também na tela "Cobrança automática".
- **Textos das mensagens**: divididos entre "Modelos de mensagem", "Cobrança automática" e "Robô WhatsApp".

### 3. Nomes que não batem entre o menu e a página
| No menu | Título dentro da página |
|---|---|
| Recebimentos (Pix) | Formas de Pagamento — PIX & Gateways |
| Configurações | Ajustes Gerais & Automação |
| Cobranças | Monitor de Cobranças |
| Robô WhatsApp | Robô WhatsApp & Auto-Atendimento |

Também há mistura de "PIX" e "Pix", "Salvar Ajustes" e "Salvar Ajustes & Automação" na mesma tela, e títulos com tamanhos/pesos de fonte diferentes de uma tela para outra.

### 4. Menu sem prioridade clara
"Cobranças" (o que os clientes devem) e "Cobrança automática" (as regras de envio) têm nomes quase iguais e ficam em grupos diferentes — é o erro que mais confunde.

---

## O que vou fazer

### A. Enxugar telas duplicadas
- Juntar **Indicadores** e **Atividades** dentro do Painel, como duas abas ("Visão geral" e "Histórico"). As páginas soltas somem.
- Juntar **Operação de clientes** dentro de Clientes.
- Juntar **Sincronização dos servidores** dentro de Painel Sigma (aba "Sincronização").
- Juntar **Diagnóstico do WhatsApp** dentro de WhatsApp (aba "Diagnóstico").
- Ajustar os links antigos e a busca para apontarem para os novos lugares (nada quebra).

### B. Cada configuração em um lugar só
- Pix e Mercado Pago: **somente** em "Recebimentos". No Robô, entra um aviso curto com atalho para lá.
- Nome da revenda: **somente** em Configurações; o Robô passa a usar esse nome.
- Regras de quando cobrar: **somente** em "Cobrança automática". Configurações mantém apenas o liga/desliga geral e o horário, com atalho.
- Textos de cobrança: **somente** em "Modelos de mensagem". O Robô fica com as falas do atendimento e da atendente com inteligência artificial.

### C. Menu mais claro
```text
Operação      Painel · Clientes · Pedidos · Cobranças a receber
Automação     Robô WhatsApp · Régua de cobrança · Modelos de mensagem
Conexões      Painel Sigma · WhatsApp · Recebimentos (Pix)
Conta         Assinatura · Configurações · Administração
```
"Cobranças" vira "Cobranças a receber" e "Cobrança automática" vira "Régua de cobrança" — some a confusão entre as duas.

### D. Padronizar textos e visual
- Título da página igual ao nome no menu, em todas as telas.
- Mesmo tamanho e peso de título, mesma frase de apoio e mesmo botão "Salvar" em todas.
- Padronizar "Pix" (não "PIX"), "WhatsApp", "Mercado Pago"; tirar CAIXA ALTA e nomes técnicos das telas.
- Revisar erros de texto, botões sem ação e mensagens de tela vazia em cada página.

### E. Conferência final
Abro cada tela do painel, clico nos botões principais e confirmo que nada quebrou, no celular e no computador.

## Detalhes técnicos
Rotas removidas viram abas nas telas principais; `navigation.ts` é reescrito com os novos grupos; os arquivos das rotas absorvidas são apagados e `routeTree.gen.ts` se regenera; `GlobalSearch` e os links internos são atualizados; os campos duplicados de Pix/token saem do formulário do robô e passam a ser lidos de `whatsapp_settings`. Nenhuma alteração no banco, nos dados ou nas integrações.

# SpacePlay com a mesma lógica do Sigma

## Objetivo
Permitir que cada revendedor ligue o SpacePlay como mais um painel, ao lado do Sigma: cadastrar o painel, importar os clientes, criar testes e clientes e renovar depois do pagamento. A cobrança, os lembretes, o Pix e o atendimento automático continuam iguais.

## Limite importante
O SpacePlay pede a confirmação da Cloudflare na entrada. O sistema não vai responder essa caixinha sozinho nem usar programa para burlar. O acesso fica assim:
- O revendedor entra no SpacePlay pelo próprio navegador e confirma a caixinha.
- Ele cola no sistema o código de acesso daquela sessão, numa tela protegida.
- O sistema usa esse acesso até ele expirar. Quando expirar, avisa no Início e no robô, e nenhuma renovação fica perdida.

Usuário e senha do SpacePlay não serão guardados nem testados de forma automática.

## O que o revendedor vai ver
1. **Painéis IPTV**: a tela atual passa a aceitar dois tipos de painel, Sigma e SpacePlay.
2. **Conectar SpacePlay**: campos de endereço do painel e código de acesso, um botão "Testar acesso" e uma etiqueta com o estado (Conectado, Expirado ou Sem permissão).
3. **Importar clientes**: mesmo botão do Sigma. Só preenche usuário, senha, vencimento, telefone e plano quando os dados chegam válidos. Nunca apaga um cliente e nunca deixa um campo em branco.
4. **Novo cliente e teste**: escolhe o servidor SpacePlay, cria o cliente no painel e salva aqui só depois que o painel confirmar.
5. **Renovação**: depois do pagamento, o sistema renova no SpacePlay. Se o acesso tiver expirado, guarda a renovação como pendente e avisa para colar um acesso novo.
6. **Saúde da ligação**: o Início mostra quando sincronizou pela última vez e qualquer falha.

## Etapa necessária antes de criar as ações no painel
Nada de criar, renovar ou editar vai ser inventado. Depois que você entrar no SpacePlay pelo navegador, preciso ver as requisições reais destas telas (no F12, aba Rede), sem mandar senha nem código de acesso na conversa:
- lista de clientes
- detalhes de um cliente
- criação de cliente
- criação de teste
- renovação
- lista de planos e servidores

Se alguma dessas ações exigir a caixinha da Cloudflare de novo, ela fica no modo manual e mostra um aviso claro.

## Detalhes técnicos
- Cada linha de painel ganha o campo `provider`, que pode ser `sigma` ou `spaceplay`, sem mexer nos Sigma que já existem.
- Uma camada única de painel IPTV escolhe a implementação certa para listar, criar, criar teste, renovar e testar o acesso.
- Os dados do SpacePlay ficam separados por revendedor, com RLS. O código de acesso fica só no servidor e nunca volta para a tela nem aparece nos registros.
- A importação reaproveita a regra de mesclagem do Sigma e a cópia de segurança automática dos clientes.
- A renovação usa uma chave única por pagamento, para nunca renovar duas vezes.
- Falta de permissão ou expiração vira estado "precisa reconectar" com aviso, em vez de dar erro silencioso.
- Testes: importação sem apagar dados, sem sobrescrever campos vazios, renovação sem duplicar e separação entre revendedores.
- O Sigma continua funcionando como hoje durante a mudança.

## Segurança
A senha do SpacePlay foi enviada por arquivo. Troque essa senha no painel. Ela não será usada no sistema.

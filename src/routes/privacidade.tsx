import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Política de Privacidade — Sigma Control" }] }),
  component: () => (
    <LegalPage title="Política de Privacidade" updatedAt="20 de setembro de 2026">
      <p>Esta Política descreve como o Sigma Control trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD). Este texto é um modelo base e deve ser revisado por um profissional jurídico.</p>
      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Da sua conta:</strong> nome, e-mail, senha (criptografada) e dados de pagamento da assinatura (identificador do Pix, valor e status).</li>
        <li><strong>Dos seus clientes (inseridos por você):</strong> nome, telefone, e-mail, valores, vencimentos, credenciais de acesso ao serviço revendido e histórico de mensagens.</li>
        <li><strong>Integrações:</strong> credenciais do painel Sigma, tokens do Mercado Pago/Asaas e identificação da instância do WhatsApp, usados apenas para executar as funções contratadas.</li>
        <li><strong>Técnicos:</strong> registros de acesso e atividades para segurança e auditoria.</li>
      </ul>
      <h2>2. Papéis na LGPD</h2>
      <p>Em relação aos dados dos seus clientes finais, você é o <strong>controlador</strong> e o Sigma Control atua como <strong>operador</strong>, tratando os dados exclusivamente conforme suas instruções e para prestar o serviço.</p>
      <h2>3. Finalidades</h2>
      <ul>
        <li>Prestar as funcionalidades da Plataforma (gestão, cobranças, automações).</li>
        <li>Processar pagamentos da assinatura e emitir comprovantes.</li>
        <li>Garantir segurança, prevenir fraudes e cumprir obrigações legais.</li>
        <li>Comunicar avisos operacionais (vencimento da assinatura, falhas de integração).</li>
      </ul>
      <h2>4. Compartilhamento</h2>
      <p>Compartilhamos dados apenas com provedores necessários à operação: infraestrutura e banco de dados (Supabase/Lovable Cloud), gateways de pagamento (Mercado Pago, Asaas), provedor de WhatsApp configurado por você (Evolution API) e o painel Sigma informado por você. Não vendemos dados pessoais.</p>
      <h2>5. Segurança</h2>
      <p>Adotamos isolamento de dados por conta no banco de dados (Row Level Security), criptografia em trânsito (HTTPS), senhas com hash e segredos armazenados fora do código-fonte. Recomendamos o uso de senhas fortes e a não reutilização de credenciais.</p>
      <h2>6. Retenção</h2>
      <p>Os dados são mantidos enquanto a conta estiver ativa e por até 90 dias após bloqueio por falta de pagamento ou solicitação de exclusão, salvo obrigação legal de guarda por prazo superior.</p>
      <h2>7. Seus direitos</h2>
      <p>Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade, anonimização ou exclusão dos dados, além de revogar consentimentos, pelo canal de suporte indicado no painel. A exportação completa dos seus dados está disponível em Configurações → Backup.</p>
      <h2>8. Cookies e armazenamento local</h2>
      <p>Utilizamos armazenamento local do navegador apenas para manter sua sessão, preferências de tema e cache de dados do painel. Não utilizamos cookies de publicidade.</p>
      <h2>9. Alterações</h2>
      <p>Esta Política pode ser atualizada. A versão vigente estará sempre disponível nesta página, com a data da última atualização.</p>
    </LegalPage>
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/termos")({
  head: () => ({ meta: [{ title: "Termos de Uso — Sigma Control" }] }),
  component: () => (
    <LegalPage title="Termos de Uso" updatedAt="20 de setembro de 2026">
      <p>Estes Termos regulam o uso da plataforma Sigma Control ("Plataforma"), um sistema de gestão para revendedores de serviços de streaming/IPTV. Ao criar uma conta você concorda integralmente com estes Termos. Este texto é um modelo base e deve ser revisado por um profissional jurídico antes da comercialização.</p>
      <h2>1. Objeto</h2>
      <p>A Plataforma oferece ferramentas de cadastro de clientes, controle de vencimentos, integração com painéis Sigma, envio de mensagens via WhatsApp por meio de conexão própria do usuário e recebimento de pagamentos por Pix através de contas do próprio usuário em gateways de pagamento (Mercado Pago, Asaas).</p>
      <h2>2. Responsabilidade pelo conteúdo e pelos serviços revendidos</h2>
      <p>O Sigma Control é apenas uma ferramenta de gestão. Não fornecemos, hospedamos ou distribuímos conteúdo audiovisual, listas, canais ou servidores. O usuário é o único responsável pela legalidade dos serviços que revende, pelas licenças necessárias e pelo cumprimento da legislação aplicável em sua jurisdição.</p>
      <h2>3. Conta e segurança</h2>
      <ul>
        <li>Você deve fornecer informações verdadeiras e manter sua senha em sigilo.</li>
        <li>Credenciais de terceiros (painel Sigma, tokens de gateways, WhatsApp) são cadastradas por você e utilizadas exclusivamente para executar as funções contratadas.</li>
        <li>Cada conta é isolada: seus dados não são visíveis a outros usuários.</li>
      </ul>
      <h2>4. Planos, teste grátis e pagamento</h2>
      <ul>
        <li>Novas contas recebem um período de teste gratuito com todos os recursos.</li>
        <li>Após o teste, o uso depende da contratação de um plano pago, cobrado por Pix, com limites de clientes descritos na página de planos.</li>
        <li>Ao vencer a assinatura, a conta entra em modo somente leitura por 3 dias e depois é bloqueada até a renovação. Os dados são preservados por, no mínimo, 90 dias após o bloqueio.</li>
        <li>Não há fidelidade. Valores pagos não são reembolsáveis, salvo falha comprovada da Plataforma.</li>
      </ul>
      <h2>5. Uso do WhatsApp e mensagens</h2>
      <p>O envio de mensagens ocorre a partir do número do próprio usuário. O usuário se compromete a enviar mensagens apenas a clientes que consentiram em recebê-las, respeitando as políticas do WhatsApp e a legislação de proteção de dados. O Sigma Control não se responsabiliza por bloqueios ou restrições aplicados pelo WhatsApp.</p>
      <h2>6. Disponibilidade</h2>
      <p>Empregamos esforços razoáveis para manter a Plataforma disponível, sem garantia de funcionamento ininterrupto. Integrações dependem de serviços de terceiros (Supabase, Mercado Pago, Asaas, Evolution API, painéis Sigma) sujeitos às suas próprias condições.</p>
      <h2>7. Encerramento</h2>
      <p>Podemos suspender ou encerrar contas que violem estes Termos, utilizem a Plataforma para fins ilícitos ou pratiquem envio massivo não solicitado de mensagens. Você pode encerrar sua conta a qualquer momento.</p>
      <h2>8. Alterações</h2>
      <p>Estes Termos podem ser atualizados. Alterações relevantes serão comunicadas no painel. O uso continuado após a publicação implica concordância.</p>
      <h2>9. Contato</h2>
      <p>Dúvidas sobre estes Termos podem ser enviadas pelo canal de suporte informado no painel.</p>
    </LegalPage>
  ),
});

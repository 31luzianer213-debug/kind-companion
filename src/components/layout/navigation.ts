import {
  Bot,
  CreditCard,
  Crown,

  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  Receipt,
  Server,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AppRoute =
  | "/painel"
  | "/pedidos"
  | "/clientes"
  | "/cobrancas"
  | "/cobranca-automatica"
  | "/sigma"
  | "/bot"
  | "/whatsapp"
  | "/pagamentos"
  | "/mensagens"
  | "/assinatura"
  | "/admin"
  | "/configuracoes";

export type NavigationBadge = "orders" | "clients" | "invoices" | "sigma" | "whatsapp";

export interface NavigationItem {
  to: AppRoute;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badgeKey?: NavigationBadge;
  mobilePrimary?: boolean;
  adminOnly?: boolean;
}

export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    title: "Operação",
    items: [
      { to: "/painel", label: "Painel", shortLabel: "Painel", icon: LayoutDashboard, mobilePrimary: true },
      { to: "/clientes", label: "Clientes", shortLabel: "Clientes", icon: Users, badgeKey: "clients", mobilePrimary: true },
      { to: "/pedidos", label: "Pedidos", shortLabel: "Pedidos", icon: ShoppingBag, badgeKey: "orders" },
      { to: "/cobrancas", label: "Cobranças a receber", shortLabel: "Cobranças", icon: Receipt, badgeKey: "invoices", mobilePrimary: true },
    ],
  },
  {
    title: "Automação",
    items: [
      { to: "/bot", label: "Robô WhatsApp", shortLabel: "Robô", icon: Bot },
      { to: "/cobranca-automatica", label: "Régua de cobrança", shortLabel: "Régua", icon: Timer },
      { to: "/mensagens", label: "Modelos de mensagem", shortLabel: "Mensagens", icon: MessageSquareText },
    ],
  },
  {
    title: "Conexões",
    items: [
      { to: "/sigma", label: "Painel Sigma", shortLabel: "Sigma", icon: Server, badgeKey: "sigma" },
      { to: "/whatsapp", label: "WhatsApp", shortLabel: "WhatsApp", icon: MessageCircle, badgeKey: "whatsapp", mobilePrimary: true },
      { to: "/pagamentos", label: "Recebimentos (Pix)", shortLabel: "Pix", icon: CreditCard },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/assinatura", label: "Assinatura", shortLabel: "Plano", icon: Crown },
      { to: "/configuracoes", label: "Configurações", shortLabel: "Ajustes", icon: Settings },
      { to: "/admin", label: "Administração", shortLabel: "Admin", icon: ShieldCheck, adminOnly: true },
    ],
  },
];

export const pageDescriptions: Record<string, string> = {
  "/painel": "Visão geral da sua operação em um só lugar.",
  "/clientes": "Todos os seus clientes, vencimentos e acessos.",
  "/pedidos": "Pedidos feitos pelos clientes no WhatsApp esperando aprovação.",
  "/cobrancas": "Quem está devendo e quem já pagou.",
  "/bot": "O robô que atende, vende e renova no WhatsApp.",
  "/cobranca-automatica": "Quando e como as cobranças são enviadas sozinhas.",
  "/mensagens": "Textos usados nas cobranças e avisos.",
  "/sigma": "Ligue seu painel Sigma para sincronizar e renovar acessos.",
  "/whatsapp": "Conecte o número que envia cobranças e responde clientes.",
  "/pagamentos": "Chave Pix e formas de receber dos clientes.",
  "/assinatura": "Seu plano no Sigma Control.",
  "/configuracoes": "Dados da sua revenda e preferências.",
  "/admin": "Planos, revendedores e assinaturas do sistema.",
};

export const primaryMobileNavigation = navigationGroups
  .flatMap((group) => group.items)
  .filter((item) => item.mobilePrimary);

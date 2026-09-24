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
    title: "Dia a dia",
    items: [
      { to: "/painel", label: "Início", shortLabel: "Início", icon: LayoutDashboard, mobilePrimary: true },
      { to: "/clientes", label: "Clientes", shortLabel: "Clientes", icon: Users, badgeKey: "clients", mobilePrimary: true },
      { to: "/cobrancas", label: "Cobranças", shortLabel: "Cobranças", icon: Receipt, badgeKey: "invoices", mobilePrimary: true },
      { to: "/pedidos", label: "Pedidos", shortLabel: "Pedidos", icon: ShoppingBag, badgeKey: "orders" },
    ],
  },
  {
    title: "Automação",
    items: [
      { to: "/whatsapp", label: "WhatsApp", shortLabel: "WhatsApp", icon: MessageCircle, badgeKey: "whatsapp", mobilePrimary: true },
      { to: "/bot", label: "Atendimento automático", shortLabel: "Atendimento", icon: Bot },
      { to: "/cobranca-automatica", label: "Cobrança automática", shortLabel: "Cobrança", icon: Timer },
      { to: "/mensagens", label: "Modelos de mensagem", shortLabel: "Mensagens", icon: MessageSquareText },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/sigma", label: "Painel Sigma", shortLabel: "Sigma", icon: Server, badgeKey: "sigma" },
      { to: "/pagamentos", label: "Recebimentos", shortLabel: "Receber", icon: CreditCard },
      { to: "/assinatura", label: "Assinatura", shortLabel: "Plano", icon: Crown },
      { to: "/configuracoes", label: "Configurações", shortLabel: "Ajustes", icon: Settings },
      { to: "/admin", label: "Administração", shortLabel: "Admin", icon: ShieldCheck, adminOnly: true },
    ],
  },
];

export const pageDescriptions: Record<string, string> = {
  "/painel": "Resumo do mês e o que precisa da sua atenção hoje.",
  "/clientes": "Todos os seus clientes, vencimentos e acessos.",
  "/cobrancas": "Quem está devendo e quem já pagou.",
  "/pedidos": "Pedidos feitos pelos clientes no WhatsApp esperando aprovação.",
  "/whatsapp": "Conecte o número que envia cobranças e responde clientes.",
  "/bot": "Como o atendimento responde sozinho aos seus clientes.",
  "/cobranca-automatica": "Quando e como as cobranças são enviadas sozinhas.",
  "/mensagens": "Textos usados nas cobranças e avisos.",
  "/sigma": "Ligue seu painel Sigma para sincronizar e renovar acessos.",
  "/pagamentos": "Chave Pix e formas de receber dos clientes.",
  "/assinatura": "Seu plano no Sigma Control.",
  "/configuracoes": "Dados da sua revenda e preferências.",
  "/admin": "Planos, revendedores e assinaturas do sistema.",
};

export const primaryMobileNavigation = navigationGroups
  .flatMap((group) => group.items)
  .filter((item) => item.mobilePrimary);

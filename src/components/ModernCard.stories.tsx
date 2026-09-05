import type { Meta, StoryObj } from '@storybook/react';
import { 
  ModernCard, 
  ModernCardHeader, 
  ModernCardTitle, 
  ModernCardDescription,
  ModernCardContent,
  ModernCardFooter,
  StatBadge 
} from './ModernCard';

const meta: Meta<typeof ModernCard> = {
  title: 'Design System/ModernCard',
  component: ModernCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f8fafc' },
        { name: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        { name: 'dark', value: '#0f172a' },
      ],
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'gradient', 'glass'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ModernCard>;

export const Gradient: Story = {
  args: {
    variant: 'gradient',
    children: (
      <>
        <ModernCardHeader>
          <ModernCardTitle>Visão Geral do Projeto</ModernCardTitle>
          <ModernCardDescription>
            Acompanhe métricas essenciais e métricas de desempenho do seu projeto em tempo real.
          </ModernCardDescription>
        </ModernCardHeader>
        <ModernCardContent>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <StatBadge value="94.2%" label="Uptime" trend="up" />
            <StatBadge value="1.2s" label="Latência" trend="up" />
            <StatBadge value="99.8%" label="Sucesso" trend="up" />
          </div>
        </ModernCardContent>
        <ModernCardFooter>
          <button style={{ 
            padding: '0.75rem 1.5rem', 
            borderRadius: '12px',
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            Ver Detalhes
          </button>
        </ModernCardFooter>
      </>
    ),
  },
};

export const Glass: Story = {
  args: {
    variant: 'glass',
    children: (
      <>
        <ModernCardHeader>
          <ModernCardTitle>Performance Analytics</ModernCardTitle>
          <ModernCardDescription>
            Análise detalhada de performance com insights em tempo real.
          </ModernCardDescription>
        </ModernCardHeader>
        <ModernCardContent>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <StatBadge value="+23%" label="Crescimento" trend="up" />
            <StatBadge value="-15%" label="Bounce" trend="down" />
          </div>
        </ModernCardContent>
      </>
    ),
  },
};

export const Default: Story = {
  args: {
    variant: 'default',
    children: (
      <>
        <ModernCardHeader>
          <ModernCardTitle>Relatório Mensal</ModernCardTitle>
          <ModernCardDescription>
            Resumo das atividades do último mês.
          </ModernCardDescription>
        </ModernCardHeader>
        <ModernCardContent>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <StatBadge value="1,234" label="Visitantes" trend="neutral" />
            <StatBadge value="89" label="Conversões" trend="up" />
          </div>
        </ModernCardContent>
      </>
    ),
  },
};

export const Interactive: Story = {
  args: {
    variant: 'gradient',
    onClick: () => alert('Card clicked!'),
    children: (
      <>
        <ModernCardHeader>
          <ModernCardTitle>Clique aqui!</ModernCardTitle>
          <ModernCardDescription>
            Este card é interativo. Passe o mouse para ver o efeito shimmer.
          </ModernCardDescription>
        </ModernCardHeader>
      </>
    ),
  },
};

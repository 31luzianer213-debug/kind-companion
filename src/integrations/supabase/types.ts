export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bot_settings: {
        Row: {
          config: Json
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          activated_at: string | null
          created_at: string
          due_day: number
          email: string | null
          id: string
          iptv_password: string | null
          iptv_username: string | null
          list_id: string | null
          monthly_fee: number
          name: string
          next_due_date: string | null
          notes: string | null
          panel_id: string | null
          phone: string
          screens: number
          sigma_customer_id: string | null
          sigma_synced_at: string | null
          sigma_username: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          due_day?: number
          email?: string | null
          id?: string
          iptv_password?: string | null
          iptv_username?: string | null
          list_id?: string | null
          monthly_fee?: number
          name: string
          next_due_date?: string | null
          notes?: string | null
          panel_id?: string | null
          phone: string
          screens?: number
          sigma_customer_id?: string | null
          sigma_synced_at?: string | null
          sigma_username?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          due_day?: number
          email?: string | null
          id?: string
          iptv_password?: string | null
          iptv_username?: string | null
          list_id?: string | null
          monthly_fee?: number
          name?: string
          next_due_date?: string | null
          notes?: string | null
          panel_id?: string | null
          phone?: string
          screens?: number
          sigma_customer_id?: string | null
          sigma_synced_at?: string | null
          sigma_username?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "iptv_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "sigma_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          due_date: string
          id: string
          last_reminder_at: string | null
          paid_at: string | null
          reminders_sent: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string
          due_date: string
          id?: string
          last_reminder_at?: string | null
          paid_at?: string | null
          reminders_sent?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          due_date?: string
          id?: string
          last_reminder_at?: string | null
          paid_at?: string | null
          reminders_sent?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_lists: {
        Row: {
          capacity: number
          channel_count: number
          content: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          password: string | null
          server_url: string | null
          sort_order: number
          status: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          capacity?: number
          channel_count?: number
          content?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          password?: string | null
          server_url?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          capacity?: number
          channel_count?: number
          content?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          password?: string | null
          server_url?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      message_logs: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          error: string | null
          id: string
          invoice_id: string | null
          phone: string
          status: string
          user_id: string
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          phone: string
          status?: string
          user_id: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          phone?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          created_at: string
          customer_name: string
          customer_phone: string
          duration_months: number
          gateway_payment_id: string | null
          id: string
          notes: string | null
          order_number: number
          payment_method: string
          pix_code: string | null
          plan_name: string
          screens: number
          status: string
          target_username: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_name?: string
          customer_phone: string
          duration_months?: number
          gateway_payment_id?: string | null
          id: string
          notes?: string | null
          order_number?: number
          payment_method?: string
          pix_code?: string | null
          plan_name: string
          screens?: number
          status?: string
          target_username?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_name?: string
          customer_phone?: string
          duration_months?: number
          gateway_payment_id?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          payment_method?: string
          pix_code?: string | null
          plan_name?: string
          screens?: number
          status?: string
          target_username?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      saas_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string
          features: Json
          highlighted: boolean
          id: string
          max_clients: number | null
          name: string
          price_monthly: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          features?: Json
          highlighted?: boolean
          id: string
          max_clients?: number | null
          name: string
          price_monthly: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          features?: Json
          highlighted?: boolean
          id?: string
          max_clients?: number | null
          name?: string
          price_monthly?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      saas_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          plan_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          plan_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_payments: {
        Row: {
          amount: number
          approved_at: string | null
          created_at: string
          id: string
          months: number
          pix_code: string | null
          pix_qr_base64: string | null
          plan_id: string
          provider: string
          provider_payment_id: string | null
          status: string
          ticket_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          created_at?: string
          id?: string
          months?: number
          pix_code?: string | null
          pix_qr_base64?: string | null
          plan_id: string
          provider?: string
          provider_payment_id?: string | null
          status?: string
          ticket_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          created_at?: string
          id?: string
          months?: number
          pix_code?: string | null
          pix_qr_base64?: string | null
          plan_id?: string
          provider?: string
          provider_payment_id?: string | null
          status?: string
          ticket_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sigma_panels: {
        Row: {
          auto_renew: boolean | null
          created_at: string | null
          enabled: boolean | null
          id: string
          last_sync_at: string | null
          name: string
          password: string | null
          streaming_dns: string | null
          token: string | null
          updated_at: string | null
          url: string
          user_id: string
          username: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_sync_at?: string | null
          name?: string
          password?: string | null
          streaming_dns?: string | null
          token?: string | null
          updated_at?: string | null
          url?: string
          user_id: string
          username?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_sync_at?: string | null
          name?: string
          password?: string | null
          streaming_dns?: string | null
          token?: string | null
          updated_at?: string | null
          url?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      whatsapp_processed_messages: {
        Row: {
          message_id: string
          processed_at: string
        }
        Insert: {
          message_id: string
          processed_at?: string
        }
        Update: {
          message_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      whatsapp_settings: {
        Row: {
          api_key: string | null
          api_url: string | null
          asaas_env: string
          asaas_token: string | null
          asaas_webhook_token: string | null
          auto_send_enabled: boolean
          business_name: string | null
          created_at: string
          instance_name: string | null
          mercadopago_token: string | null
          message_template: string
          overdue_reminder: boolean
          overdue_template: string
          payment_link: string | null
          payment_provider: string
          pix_holder: string | null
          pix_key: string | null
          pix_key_type: string
          reminder_days_before: number
          send_on_due_day: boolean
          sigma_auto_renew: boolean
          sigma_enabled: boolean
          sigma_last_sync_at: string | null
          sigma_password: string | null
          sigma_token: string | null
          sigma_url: string | null
          sigma_username: string | null
          test_server_id: string | null
          updated_at: string
          user_id: string
          welcome_template: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          asaas_env?: string
          asaas_token?: string | null
          asaas_webhook_token?: string | null
          auto_send_enabled?: boolean
          business_name?: string | null
          created_at?: string
          instance_name?: string | null
          mercadopago_token?: string | null
          message_template?: string
          overdue_reminder?: boolean
          overdue_template?: string
          payment_link?: string | null
          payment_provider?: string
          pix_holder?: string | null
          pix_key?: string | null
          pix_key_type?: string
          reminder_days_before?: number
          send_on_due_day?: boolean
          sigma_auto_renew?: boolean
          sigma_enabled?: boolean
          sigma_last_sync_at?: string | null
          sigma_password?: string | null
          sigma_token?: string | null
          sigma_url?: string | null
          sigma_username?: string | null
          test_server_id?: string | null
          updated_at?: string
          user_id: string
          welcome_template?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          asaas_env?: string
          asaas_token?: string | null
          asaas_webhook_token?: string | null
          auto_send_enabled?: boolean
          business_name?: string | null
          created_at?: string
          instance_name?: string | null
          mercadopago_token?: string | null
          message_template?: string
          overdue_reminder?: boolean
          overdue_template?: string
          payment_link?: string | null
          payment_provider?: string
          pix_holder?: string | null
          pix_key?: string | null
          pix_key_type?: string
          reminder_days_before?: number
          send_on_due_day?: boolean
          sigma_auto_renew?: boolean
          sigma_enabled?: boolean
          sigma_last_sync_at?: string | null
          sigma_password?: string | null
          sigma_token?: string | null
          sigma_url?: string | null
          sigma_username?: string | null
          test_server_id?: string | null
          updated_at?: string
          user_id?: string
          welcome_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_test_server_id_fkey"
            columns: ["test_server_id"]
            isOneToOne: false
            referencedRelation: "sigma_panels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

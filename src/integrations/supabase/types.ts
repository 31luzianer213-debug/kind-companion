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
      whatsapp_settings: {
        Row: {
          api_key: string | null
          api_url: string | null
          asaas_env: string
          asaas_token: string | null
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
          sigma_token: string | null
          sigma_url: string | null
          sigma_username: string | null
          sigma_password: string | null
          updated_at: string
          user_id: string
          welcome_template: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          asaas_env?: string
          asaas_token?: string | null
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
          sigma_token?: string | null
          sigma_url?: string | null
          sigma_username?: string | null
          sigma_password?: string | null
          updated_at?: string
          user_id: string
          welcome_template?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          asaas_env?: string
          asaas_token?: string | null
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
          sigma_token?: string | null
          sigma_url?: string | null
          sigma_username?: string | null
          sigma_password?: string | null
          updated_at?: string
          user_id?: string
          welcome_template?: string
        }
        Relationships: []
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

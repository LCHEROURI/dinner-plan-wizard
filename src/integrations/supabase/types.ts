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
      meal_plans: {
        Row: {
          created_at: string
          error_message: string | null
          generation_input: Json | null
          id: string
          name: string
          owner_id: string
          plan_length: number
          preferred_servings: number | null
          servings: number
          share_token: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          generation_input?: Json | null
          id?: string
          name?: string
          owner_id: string
          plan_length?: number
          preferred_servings?: number | null
          servings?: number
          share_token?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          generation_input?: Json | null
          id?: string
          name?: string
          owner_id?: string
          plan_length?: number
          preferred_servings?: number | null
          servings?: number
          share_token?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allergens: string[] | null
          available_equipment: string[] | null
          budget_preference: string | null
          created_at: string
          default_plan_length: number | null
          default_servings: number | null
          dietary_pattern: string | null
          disliked_cuisines: string[] | null
          display_name: string | null
          email: string | null
          excluded_ingredients: string[] | null
          favorite_cuisines: string[] | null
          household_size: number | null
          id: string
          leftover_preference: boolean | null
          max_total_time_minutes: number | null
          measurement_system: string | null
          onboarding_completed: boolean | null
          preferred_proteins: string[] | null
          skill_level: string | null
          updated_at: string
        }
        Insert: {
          allergens?: string[] | null
          available_equipment?: string[] | null
          budget_preference?: string | null
          created_at?: string
          default_plan_length?: number | null
          default_servings?: number | null
          dietary_pattern?: string | null
          disliked_cuisines?: string[] | null
          display_name?: string | null
          email?: string | null
          excluded_ingredients?: string[] | null
          favorite_cuisines?: string[] | null
          household_size?: number | null
          id: string
          leftover_preference?: boolean | null
          max_total_time_minutes?: number | null
          measurement_system?: string | null
          onboarding_completed?: boolean | null
          preferred_proteins?: string[] | null
          skill_level?: string | null
          updated_at?: string
        }
        Update: {
          allergens?: string[] | null
          available_equipment?: string[] | null
          budget_preference?: string | null
          created_at?: string
          default_plan_length?: number | null
          default_servings?: number | null
          dietary_pattern?: string | null
          disliked_cuisines?: string[] | null
          display_name?: string | null
          email?: string | null
          excluded_ingredients?: string[] | null
          favorite_cuisines?: string[] | null
          household_size?: number | null
          id?: string
          leftover_preference?: boolean | null
          max_total_time_minutes?: number | null
          measurement_system?: string | null
          onboarding_completed?: boolean | null
          preferred_proteins?: string[] | null
          skill_level?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          allergen_flags: string[] | null
          authenticity_label: string | null
          cook_time_minutes: number | null
          cooking_steps: Json | null
          created_at: string
          cuisine: string | null
          description: string | null
          dietary_tags: string[] | null
          difficulty: string | null
          equipment: string[] | null
          food_safety_notes: string[] | null
          id: string
          ingredients: Json | null
          leftover_instructions: string | null
          name: string
          order: number
          origin_country: string | null
          owner_id: string
          plan_id: string
          prep_time_minutes: number | null
          preparation_steps: Json | null
          presentation_suggestions: string | null
          servings: number | null
          side_dish_suggestion: string | null
          substitutions: Json | null
          total_time_minutes: number | null
          updated_at: string
          why_it_fits: string | null
        }
        Insert: {
          allergen_flags?: string[] | null
          authenticity_label?: string | null
          cook_time_minutes?: number | null
          cooking_steps?: Json | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          difficulty?: string | null
          equipment?: string[] | null
          food_safety_notes?: string[] | null
          id?: string
          ingredients?: Json | null
          leftover_instructions?: string | null
          name: string
          order?: number
          origin_country?: string | null
          owner_id: string
          plan_id: string
          prep_time_minutes?: number | null
          preparation_steps?: Json | null
          presentation_suggestions?: string | null
          servings?: number | null
          side_dish_suggestion?: string | null
          substitutions?: Json | null
          total_time_minutes?: number | null
          updated_at?: string
          why_it_fits?: string | null
        }
        Update: {
          allergen_flags?: string[] | null
          authenticity_label?: string | null
          cook_time_minutes?: number | null
          cooking_steps?: Json | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          difficulty?: string | null
          equipment?: string[] | null
          food_safety_notes?: string[] | null
          id?: string
          ingredients?: Json | null
          leftover_instructions?: string | null
          name?: string
          order?: number
          origin_country?: string | null
          owner_id?: string
          plan_id?: string
          prep_time_minutes?: number | null
          preparation_steps?: Json | null
          presentation_suggestions?: string | null
          servings?: number | null
          side_dish_suggestion?: string | null
          substitutions?: Json | null
          total_time_minutes?: number | null
          updated_at?: string
          why_it_fits?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_items: {
        Row: {
          category: string | null
          created_at: string
          display_text: string | null
          id: string
          is_checked: boolean | null
          is_custom: boolean | null
          is_pantry_item: boolean | null
          name: string
          owner_id: string
          plan_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          display_text?: string | null
          id?: string
          is_checked?: boolean | null
          is_custom?: boolean | null
          is_pantry_item?: boolean | null
          name: string
          owner_id: string
          plan_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          display_text?: string | null
          id?: string
          is_checked?: boolean | null
          is_custom?: boolean | null
          is_pantry_item?: boolean | null
          name?: string
          owner_id?: string
          plan_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _test_cleanup_shared_plan: {
        Args: { p_owner_id: string; p_plan_id: string }
        Returns: undefined
      }
      _test_confirm_user: { Args: { p_user_id: string }; Returns: undefined }
      _test_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      _test_seed_authed_user: {
        Args: { p_email: string; p_password: string }
        Returns: string
      }
      _test_seed_shared_plan: {
        Args: {
          p_owner_id: string
          p_plan_id: string
          p_preferred_servings: number
          p_share_token: string
        }
        Returns: undefined
      }
      get_shared_plan: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          id: string
          name: string
          plan_length: number
          servings: number
          summary: string
        }[]
      }
      get_shared_recipes: {
        Args: { p_token: string }
        Returns: {
          allergen_flags: string[] | null
          authenticity_label: string | null
          cook_time_minutes: number | null
          cooking_steps: Json | null
          created_at: string
          cuisine: string | null
          description: string | null
          dietary_tags: string[] | null
          difficulty: string | null
          equipment: string[] | null
          food_safety_notes: string[] | null
          id: string
          ingredients: Json | null
          leftover_instructions: string | null
          name: string
          order: number
          origin_country: string | null
          owner_id: string
          plan_id: string
          prep_time_minutes: number | null
          preparation_steps: Json | null
          presentation_suggestions: string | null
          servings: number | null
          side_dish_suggestion: string | null
          substitutions: Json | null
          total_time_minutes: number | null
          updated_at: string
          why_it_fits: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "recipes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setSessionId } from "./api";

interface OrderItem {
  item_id: number;
  quantity: number;
  note?: string;
  name: string;
  price: number;
}

interface CustomerState {
  sessionId: string | null;
  tableId: number | null;
  status: string | null;
  cart: OrderItem[];

  setSession: (sessionId: string, tableId: number, status: string) => void;
  addToCart: (item: OrderItem) => void;
  removeFromCart: (itemId: number) => void;
  updateQuantity: (itemId: number, quantity: number) => void;
  clearCart: () => void;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set) => ({
      sessionId: null,
      tableId: null,
      status: null,
      cart: [],

      setSession: (sessionId, tableId, status) => {
        setSessionId(sessionId);
        set({ sessionId, tableId, status });
      },

      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find((i) => i.item_id === item.item_id);
          if (existing) {
            return {
              cart: state.cart.map((i) =>
                i.item_id === item.item_id
                  ? {
                      ...i,
                      quantity: i.quantity + item.quantity,
                      note: item.note || i.note,
                    }
                  : i,
              ),
            };
          }
          return { cart: [...state.cart, item] };
        }),

      removeFromCart: (itemId) =>
        set((state) => ({
          cart: state.cart.filter((i) => i.item_id !== itemId),
        })),

      updateQuantity: (itemId, quantity) =>
        set((state) => ({
          cart: state.cart.map((i) =>
            i.item_id === itemId ? { ...i, quantity } : i,
          ),
        })),

      clearCart: () => set({ cart: [] }),
    }),
    {
      name: "customer_session",
      partialize: (state) => ({
        sessionId: state.sessionId,
        tableId: state.tableId,
        status: state.status,
        cart: state.cart,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.sessionId) {
          setSessionId(state.sessionId);
        }
      },
    },
  ),
);

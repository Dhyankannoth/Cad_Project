import { PaymentGateway, type PaymentReceipt } from "./paymentGateway.js";

export interface OrderItem {
    sku: string;
    quantity: number;
    unitPriceCents: number;
}

export interface Order {
    id: string;
    customerEmail: string;
    items: OrderItem[];
    totalAmountCents: number;
    status: "created" | "paid" | "shipped" | "cancelled";
}

export class OrderService {
    private paymentGateway: PaymentGateway;
    private orders: Map<string, Order> = new Map();

    constructor(paymentGateway: PaymentGateway) {
        this.paymentGateway = paymentGateway;
    }

    public createOrder(customerEmail: string, items: OrderItem[]): Order {
        if (!items || items.length === 0) {
            throw new Error("Cannot create order without items");
        }

        const totalAmountCents = items.reduce(
            (sum, item) => sum + item.quantity * item.unitPriceCents,
            0
        );

        const order: Order = {
            id: `ord_${Date.now()}`,
            customerEmail,
            items,
            totalAmountCents,
            status: "created"
        };

        this.orders.set(order.id, order);
        return order;
    }

    public async checkout(orderId: string): Promise<PaymentReceipt> {
        const order = this.orders.get(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const receipt = await this.paymentGateway.processCharge({
            orderId: order.id,
            amountCents: order.totalAmountCents,
            currency: "USD",
            customerEmail: order.customerEmail
        });

        if (receipt.status === "succeeded") {
            order.status = "paid";
        }

        return receipt;
    }
}

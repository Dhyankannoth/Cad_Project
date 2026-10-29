export interface PaymentRequest {
    orderId: string;
    amountCents: number;
    currency: "USD" | "EUR" | "GBP";
    customerEmail: string;
}

export interface PaymentReceipt {
    transactionId: string;
    orderId: string;
    status: "succeeded" | "failed" | "pending";
    timestamp: string;
}

export class PaymentGateway {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    public async processCharge(request: PaymentRequest): Promise<PaymentReceipt> {
        if (request.amountCents <= 0) {
            throw new Error("Charge amount must be greater than zero");
        }

        return {
            transactionId: `txn_${Date.now()}`,
            orderId: request.orderId,
            status: "succeeded",
            timestamp: new Date().toISOString()
        };
    }
}

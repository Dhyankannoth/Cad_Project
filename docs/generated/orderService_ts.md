# Developer Guide: `orderService.ts`

The `orderService.ts` module provides order management and checkout processing capabilities for the sample project. It encapsulates order creation, total calculations, in-memory state tracking, and integration with the `PaymentGateway`.

---

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Data Interfaces](#data-interfaces)
  - [`OrderItem`](#orderitem)
  - [`Order`](#order)
- [Class API Reference: `OrderService`](#class-api-reference-orderservice)
  - [`constructor(paymentGateway)`](#constructorpaymentgateway)
  - [`createOrder(customerEmail, items)`](#createordercustomeremail-items)
  - [`checkout(orderId)`](#checkoutorderid)
- [Usage Examples](#usage-examples)
- [Error Handling & Edge Cases](#error-handling--edge-cases)

---

## Overview

`OrderService` manages the lifecycle of customer orders:
1. **Order Creation:** Calculates order totals from item lists and generates unique order identifiers.
2. **Order Storage:** Retains created orders in an internal in-memory map.
3. **Checkout Processing:** Coordinates payment processing with a `PaymentGateway` and transitions the order status to `"paid"` upon successful transaction execution.

---

## Dependencies

- **`PaymentGateway`**, **`PaymentReceipt`** (imported from `./paymentGateway.js`): Used for processing charges against created orders.

---

## Data Interfaces

### `OrderItem`

Represents an individual line item in an order.

```typescript
export interface OrderItem {
    sku: string;
    quantity: number;
    unitPriceCents: number;
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `sku` | `string` | Stock Keeping Unit identifier for the item. |
| `quantity` | `number` | Number of units purchased. |
| `unitPriceCents` | `number` | Price per unit in cents (e.g., `1000` = $10.00 USD). |

---

### `Order`

Represents an order record within the system.

```typescript
export interface Order {
    id: string;
    customerEmail: string;
    items: OrderItem[];
    totalAmountCents: number;
    status: "created" | "paid" | "shipped" | "cancelled";
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique order identifier formatted as `ord_<timestamp>`. |
| `customerEmail` | `string` | Contact email address of the customer. |
| `items` | `OrderItem[]` | List of items included in the order. |
| `totalAmountCents` | `number` | Total calculated order price in cents. |
| `status` | `"created" \| "paid" \| "shipped" \| "cancelled"` | Current lifecycle status of the order. |

---

## Class API Reference: `OrderService`

### `constructor(paymentGateway)`

Instantiates a new `OrderService` with the required payment gateway instance.

```typescript
constructor(paymentGateway: PaymentGateway)
```

- **Parameters:**
  - `paymentGateway`: `PaymentGateway` — An instance of `PaymentGateway` used to execute payment processing during checkout.

---

### `createOrder(customerEmail, items)`

Creates a new order, calculates the total amount based on items, stores it internally, and returns the generated `Order`.

```typescript
public createOrder(customerEmail: string, items: OrderItem[]): Order
```

- **Parameters:**
  - `customerEmail`: `string` — The email address of the customer.
  - `items`: `OrderItem[]` — Array of line items. Must contain at least one item.

- **Returns:**
  - `Order` — The newly created order object with status `"created"`.

- **Validation & Logic:**
  - Throws an `Error` if `items` is null, undefined, or empty (`items.length === 0`).
  - Total amount is calculated as `sum(quantity * unitPriceCents)`.
  - Generates `id` using timestamp prefix: `ord_${Date.now()}`.
  - Stores the order in the internal `Map<string, Order>`.

---

### `checkout(orderId)`

Processes payment for an existing order via the configured `PaymentGateway`.

```typescript
public async checkout(orderId: string): Promise<PaymentReceipt>
```

- **Parameters:**
  - `orderId`: `string` — The unique order ID to check out.

- **Returns:**
  - `Promise<PaymentReceipt>` — Payment receipt details returned by `PaymentGateway.processCharge`.

- **Validation & Logic:**
  - Throws an `Error` if the order ID is not found in internal storage (`Order <orderId> not found`).
  - Delegates charge processing to `PaymentGateway.processCharge` with currency defaulted to `"USD"`.
  - Updates `order.status` to `"paid"` if `receipt.status === "succeeded"`.

---

## Usage Examples

### Basic Order Workflow

```typescript
import { PaymentGateway } from "./paymentGateway.js";
import { OrderService } from "./orderService.js";

async function run() {
    // 1. Initialize dependencies
    const paymentGateway = new PaymentGateway("secret_api_key");
    const orderService = new OrderService(paymentGateway);

    // 2. Create an order
    const order = orderService.createOrder("alice@example.com", [
        { sku: "WIDGET-01", quantity: 2, unitPriceCents: 1500 }, // $15.00 x 2 = $30.00
        { sku: "GADGET-02", quantity: 1, unitPriceCents: 2500 }  // $25.00 x 1 = $25.00
    ]);

    console.log(`Created Order ${order.id} with total: $${order.totalAmountCents / 100}`);
    // Output: Created Order ord_1700000000000 with total: $55

    // 3. Complete checkout
    const receipt = await orderService.checkout(order.id);
    console.log(`Payment status: ${receipt.status}, Transaction ID: ${receipt.transactionId}`);
    console.log(`Updated Order Status: ${order.status}`); // "paid"
}

run().catch(console.error);
```

---

## Error Handling & Edge Cases

| Scenario | Behavior / Exception |
| :--- | :--- |
| **Creating an order with an empty item list** | Throws `Error("Cannot create order without items")`. |
| **Checking out a non-existent order ID** | Throws `Error("Order <orderId> not found")`. |
| **Payment charge failure** | If `receipt.status` is not `"succeeded"` (e.g. `"failed"` or `"pending"`), `order.status` remains unchanged (`"created"`). |
| **Invalid payment amount** | If `totalAmountCents` is zero or negative during checkout, `PaymentGateway.processCharge` throws `Error("Charge amount must be greater than zero")`. |
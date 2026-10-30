# Getting Started

## Prerequisites

Ensure you have the following software installed before setting up the application:

- **Node.js**: Recommended v20 or higher LTS
- **Package Manager**: npm or compatible equivalent

## Installation

Clone the repository and install dependencies:

```bash
# Install project dependencies
npm install
```

## Environment Configuration

Copy the environment sample file and configure required local parameters:

```bash
cp env/.env.example env/.env
```

> [!NOTE]
> Never commit production secrets, private keys, or API tokens to source control.

## Running the Application

Start the service using the verified package script:

```bash
node .
```

## Executing Tests

Run the verification test suite:

```bash
npm test
```

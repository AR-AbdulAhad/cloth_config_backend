import { Prisma } from '@prisma/client';

export const handlePrismaError = (err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle specific Prisma error codes
        // https://www.prisma.io/docs/reference/api-reference/error-reference#error-codes
        switch (err.code) {
            case 'P2002':
                return {
                    status: 400,
                    message: `A record with this ${err.meta?.target} already exists.`
                };
            case 'P2003':
                return {
                    status: 400,
                    message: "Foreign key constraint failed. Related record not found."
                };
            case 'P2025':
                return {
                    status: 404,
                    message: "The requested record was not found."
                };
            default:
                return {
                    status: 400,
                    message: `Database error: ${err.message}`
                };
        }
    }

    if (err instanceof Prisma.PrismaClientValidationError) {
        return {
            status: 400,
            message: "Invalid data provided. Please check your input fields."
        };
    }

    if (err instanceof Prisma.PrismaClientInitializationError) {
        return {
            status: 500,
            message: "Failed to connect to the database."
        };
    }

    // Default error
    return {
        status: 500,
        message: err.message || "An unexpected error occurred."
    };
};

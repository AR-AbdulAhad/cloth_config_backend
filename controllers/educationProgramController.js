import prisma from "../config/prisma.js";
import { handlePrismaError } from "../utils/errorHandler.js";

// Create Education Program
export const addEducationProgram = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Program name is required",
      });
    }

    const program = await prisma.educationProgram.create({
      data: {
        name,
      },
    });

    res.status(201).json({
      success: true,
      message: "Education program created",
      data: program,
    });
  } catch (err) {
    const error = handlePrismaError(err);
    res.status(error.status).json({
      success: false,
      error: error.message,
    });
  }
};

// List Education Programs
export const listEducationPrograms = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search || "";

    const skip = (page - 1) * limit;

    const where = {
      ...(search && {
        name: {
          contains: search,
        },
      }),
    };

    const [programs, total] = await Promise.all([
      prisma.educationProgram.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          id: "desc",
        },
      }),

      prisma.educationProgram.count({
        where,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        data: programs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPreviousPage: page > 1,
        },
      },
    });
  } catch (err) {
    const error = handlePrismaError(err);

    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }
};
// Update Education Program
export const editEducationProgram = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    const updated = await prisma.educationProgram.update({
      where: {
        id: Number(id),
      },
      data: {
        ...(name !== undefined && { name }),
        ...(status !== undefined && { status }),
      },
    });

    res.json({
      success: true,
      message: "Education program updated",
      data: updated,
    });
  } catch (err) {
    const error = handlePrismaError(err);

    res.status(error.status).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete Education Program
export const deleteEducationProgram = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.educationProgram.delete({
      where: {
        id: Number(id),
      },
    });

    res.json({
      success: true,
      message: "Education program deleted",
    });
  } catch (err) {
    const error = handlePrismaError(err);

    res.status(error.status).json({
      success: false,
      error: error.message,
    });
  }
};
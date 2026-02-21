import prisma from "../config/prisma.js";

export const getAllNameList = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Number(req.query.limit) || 10, 100); // max 100 limit
        const skip = (page - 1) * limit;

        const process_status = req.query.status?.trim();
        const search = req.query.search?.trim();

        // Build dynamic where condition
        const where = {};

        if (process_status) {
            where.process_status = process_status;
        }

        if (search) {
            where.OR = [
                {
                    class: {
                        name: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    items: {
                        some: {
                            name: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                    },
                },
            ];
        }

        // Run queries in parallel (faster)
        const [total, nameLists] = await Promise.all([
            prisma.nameList.count({ where }),
            prisma.nameList.findMany({
                where,
                skip,
                take: limit,
                orderBy: { id: "desc" },
                include: {
                    class: true,
                    items: {
                        orderBy: { position: "asc" },
                    },
                },
            }),
        ]);

        res.json({
            success: true,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1,
            },
            data: nameLists,
        });
    } catch (error) {
        console.error("Error fetching all name lists:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch name lists",
        });
    }
};


export const getNameListForUser = async (req, res) => {
    try {
        const classId = req.params.classId ? Number(req.params.classId) : req.user.class_id;

        if (!classId) {
            return res.status(400).json({ success: false, message: "Class ID is required" });
        }

        // Verify ownership if not admin
        if (req.user.role !== 'admin' && req.user.class_id !== classId) {
            return res.status(403).json({ success: false, message: "Unauthorized access to this class's name list" });
        }

        const nameList = await prisma.nameList.findUnique({
            where: { class_id: Number(classId) },
            include: {
                class: true,
                items: {
                    orderBy: { position: "asc" }
                }
            }
        });

        if (!nameList) {
            // Optionally create one if it doesn't exist, or return empty
            return res.json({ success: true, data: null });
        }

        res.json({
            success: true,
            data: nameList
        });

    } catch (error) {
        console.error("Error fetching name list:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


export const getClassNameList = async (req, res) => {
    try {
        const { class_id } = req.params;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!class_id) {
            return res.status(400).json({ success: false, message: "Class ID is required" });
        }

        const nameList = await prisma.nameList.findUnique({
            where: { class_id: Number(class_id) }
        });

        if (!nameList) {
            return res.status(404).json({ success: false, message: "Name list not found" });
        }

        const totalItems = await prisma.nameListItem.count({
            where: { name_list_id: nameList.id }
        });

        const items = await prisma.nameListItem.findMany({
            where: { name_list_id: nameList.id },
            orderBy: { position: "asc" },
            skip,
            take: limit
        });

        res.json({
            success: true,
            nameList,
            pagination: {
                total: totalItems,
                page,
                limit,
                totalPages: Math.ceil(totalItems / limit)
            },
            items
        });

    } catch (error) {
        console.error("Error fetching name list:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


export const getnameListItem = async (req, res) => {
    try {
        const { item_id } = req.params;
        if (!item_id) {
            return res.status(400).json({ success: false, message: "Item ID is required" });
        }

        const item = await prisma.nameListItem.findUnique({
            where: { id: Number(item_id) }
        });

        if (!item) {
            return res.status(404).json({ success: false, message: "Name list item not found" });
        }

        res.json({ success: true, item });
    } catch (error) {
        console.error("Error fetching name list item:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const createNameList = async (req, res) => {
    try {
        const { class_id } = req.body;
        if (!class_id)
            return res.status(400).json({ success: false, message: "Class ID is required" });

        // Check if NameList already exists for this class
        const existing = await prisma.nameList.findUnique({ where: { class_id: Number(class_id) } });
        if (existing) return res.json({ success: true, nameList: existing });

        // Create new NameList
        const nameList = await prisma.nameList.create({
            data: {
                class_id: Number(class_id),
                process_status: "draft"
            }
        });

        res.json({ success: true, nameList });
    } catch (error) {
        console.error("Error creating name list:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


export const updateNameList = async (req, res) => {
    try {
        const { class_id } = req.body;
        if (!class_id) {
            return res.status(400).json({ success: false, message: "Class ID is required" });
        }
        let nameList = await prisma.nameList.findUnique({
            where: { class_id: Number(class_id) },
            include: {
                items: {
                    orderBy: { position: "asc" }
                }
            }
        });

        if (!nameList) {
            // Create if not exists
            nameList = await prisma.nameList.create({
                data: {
                    class_id: Number(class_id),
                    process_status: "draft"
                },
                include: {
                    items: true
                }
            });
        }
        res.json({ success: true, result: nameList }); // standardized to result or just root? Front end usually expects {data} or root.
        // Original was res.json({ success: true, nameList })
        // Let's keep it consistent but include items.
    } catch (error) {
        console.error("Error updating name list:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const addNameListItem = async (req, res) => {
    try {
        const { name } = req.body;
        const { name_list_id } = req.params;

        if (!name) {
            return res.status(400).json({ success: false, message: "Name is required" });
        }

        const nameList = await prisma.nameList.findUnique({
            where: { id: Number(name_list_id) },
            include: { class: true }
        });

        if (!nameList) {
            return res.status(404).json({ success: false, message: "Name list not found" });
        }

        // Verify ownership
        if (req.user.role !== 'admin' && nameList.class_id !== req.user.class_id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const isLocked = nameList.process_status === "locked" ||
            (nameList.class?.change_deadline && new Date() > new Date(nameList.class.change_deadline));

        if (isLocked && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Name list is locked (deadline passed or manual lock)" });
        }

        const position = await prisma.nameListItem.count({
            where: { name_list_id: Number(name_list_id) }
        });

        const item = await prisma.nameListItem.create({
            data: {
                name,
                position: position + 1,
                name_list_id: Number(name_list_id)
            }
        });

        res.json({ success: true, item });
    } catch (error) {
        console.error("Error adding name:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const updateNameListItem = async (req, res) => {
    try {
        const { name } = req.body;
        const { item_id } = req.params;

        if (!name) {
            return res.status(400).json({ success: false, message: "Name is required" });
        }

        const item = await prisma.nameListItem.findUnique({
            where: { id: Number(item_id) },
            include: { nameList: { include: { class: true } } }
        });

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        const nameList = item.nameList;
        // Verify ownership
        if (req.user.role !== 'admin' && nameList.class_id !== req.user.class_id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const isLocked = nameList.process_status === "locked" ||
            (nameList.class?.change_deadline && new Date() > new Date(nameList.class.change_deadline));

        if (isLocked && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Name list is locked (deadline passed or manual lock)" });
        }

        const updated = await prisma.nameListItem.update({
            where: { id: Number(item_id) },
            data: { name }
        });

        res.json({ success: true, item: updated });
    } catch (error) {
        console.error("Error updating name:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const reorderNameListItems = async (req, res) => {
    try {
        const { items } = req.body;
        const { name_list_id } = req.params;
        // items: [{ id: 1, position: 1 }, { id: 2, position: 2 }]

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, message: "Invalid items array" });
        }

        const nameList = await prisma.nameList.findUnique({
            where: { id: Number(name_list_id) },
            include: { class: true }
        });

        if (!nameList) {
            return res.status(404).json({ success: false, message: "Name list not found" });
        }

        // Verify ownership
        if (req.user.role !== 'admin' && nameList.class_id !== req.user.class_id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const isLocked = nameList.process_status === "locked" ||
            (nameList.class?.change_deadline && new Date() > new Date(nameList.class.change_deadline));

        if (isLocked && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Name list is locked (deadline passed or manual lock)" });
        }

        const updates = items.map(item =>
            prisma.nameListItem.update({
                where: { id: item.id },
                data: { position: item.position }
            })
        );

        await prisma.$transaction(updates);

        res.json({ success: true });
    } catch (error) {
        console.error("Error reordering names:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const markNameListReady = async (req, res) => {
    try {
        const { name_list_id } = req.params;

        const nameList = await prisma.nameList.findUnique({
            where: { id: Number(name_list_id) },
            include: { class: true }
        });

        if (!nameList) return res.status(404).json({ success: false, message: "Name list not found" });

        // Verify ownership
        if (req.user.role !== 'admin' && nameList.class_id !== req.user.class_id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const isLocked = nameList.process_status === "locked" ||
            (nameList.class?.change_deadline && new Date() > new Date(nameList.class.change_deadline));

        if (isLocked && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Name list is locked (deadline passed or manual lock)" });
        }

        await prisma.nameList.update({
            where: { id: Number(name_list_id) },
            data: { process_status: "ready" }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error marking ready:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const approveNameList = async (req, res) => {
    try {
        const { id } = req.params;
        const nameListId = Number(id);

        const existing = await prisma.nameList.findUnique({ where: { id: nameListId } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Name list not found" });
        }

        const updated = await prisma.nameList.update({
            where: { id: nameListId },
            data: { process_status: "approved" }
        });
        res.json({ success: true, message: "Name list approved", data: updated });
    } catch (error) {
        console.error("Error approving name list:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const rejectNameList = async (req, res) => {
    try {
        const { id } = req.params;
        const nameListId = Number(id);

        const existing = await prisma.nameList.findUnique({ where: { id: nameListId } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Name list not found" });
        }

        const updated = await prisma.nameList.update({
            where: { id: nameListId },
            data: { process_status: "rejected" }
        });
        res.json({ success: true, message: "Name list rejected", data: updated });
    } catch (error) {
        console.error("Error rejecting name list:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const deleteNameListItem = async (req, res) => {
    try {
        const { item_id } = req.params;

        const item = await prisma.nameListItem.findUnique({
            where: { id: Number(item_id) },
            include: { nameList: { include: { class: true } } }
        });

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        const nameList = item.nameList;
        // Verify ownership
        if (req.user.role !== 'admin' && nameList.class_id !== req.user.class_id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const isLocked = nameList.process_status === "locked" ||
            (nameList.class?.change_deadline && new Date() > new Date(nameList.class.change_deadline));

        if (isLocked && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Name list is locked (deadline passed or manual lock)" });
        }

        await prisma.nameListItem.delete({ where: { id: Number(item_id) } });

        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting name item:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
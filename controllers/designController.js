import prisma from "../config/prisma.js";
import { sendBackDesignUploadNotificationEmail, getAdminNotificationEmails, sendBackDesignStatusEmail } from "../utils/emailService.js";

// export const uploadClassBackDesign = async (req, res) => {
//     try {
//         const classId = req.user.class_id;
//         const { name } = req.body;

//         if (!classId) return res.status(400).json({ success: false, message: "User not assigned to any class" });
//         if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

//         const design = await prisma.backDesign.create({
//             data: {
//                 class_id: parseInt(classId),
//                 name: name || `back_design_${Date.now()}`,
//                 file_path: req.file.path,
//                 is_library: false,
//                 process_status: 'uploaded',
//                 status: 1
//             }
//         });

//         res.json({ success: true, message: "Back design uploaded", data: design });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };
export const uploadClassBackDesign = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { name, isFromConfigurator, designColor, forAllStudents } = req.body;

        if (!classId) return res.status(400).json({ success: false, message: "User not assigned to any class" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const isConfigurator = isFromConfigurator === 'true' || isFromConfigurator === true;
        const shareWithAll = forAllStudents === 'true' || forAllStudents === true;

        // Validate designColor if provided
        if (designColor && !['white', 'black', 'normal'].includes(designColor.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Invalid design color. Only 'white', 'black', or 'normal' are allowed."
            });
        }

        // Check agar isFromConfigurator true hai aur already ek design exist karta hai
        if (isConfigurator) {
            const existingDesign = await prisma.backDesign.findFirst({
                where: {
                    class_id: parseInt(classId),
                    isFromConfigurator: true,
                    status: { not: 2 }
                }
            });

            if (existingDesign) {
                return res.status(400).json({
                    success: false,
                    message: "Configurator back design already exists for this class. Cannot create another one.",
                    existingDesign
                });
            }
        }

        // If forAllStudents is true, fetch the class's country_id to link to library
        let libraryCountryId = null;
        if (shareWithAll) {
            const classData = await prisma.classes.findUnique({
                where: { id: parseInt(classId) },
                select: { country_id: true }
            });
            libraryCountryId = classData?.country_id || null;
        }

        const design = await prisma.backDesign.create({
            data: {
                class_id: parseInt(classId),
                name: name || `back_design_${Date.now()}`,
                file_path: req.file.path,
                is_library: shareWithAll,          // true = visible in country library
                forAllStudents: shareWithAll,
                country_id: shareWithAll ? libraryCountryId : null,
                process_status: 'uploaded',
                status: 1,
                isFromConfigurator: isConfigurator,
                designColor: designColor ? designColor.toLowerCase() : null
            }
        });

        // Send notification email to admin(s)
        try {
            const [classInfo, user, adminEmails] = await Promise.all([
                prisma.classes.findUnique({
                    where: { id: parseInt(classId) },
                    include: { school: { select: { name: true } } }
                }),
                prisma.user.findUnique({
                    where: { id: req.user.id },
                    select: { name: true, email: true }
                }),
                getAdminNotificationEmails()
            ]);

            const notificationPromises = adminEmails.map(adminEmail =>
                sendBackDesignUploadNotificationEmail({
                    adminEmail,
                    designName: design.name,
                    className: classInfo?.name || 'Unknown Class',
                    schoolName: classInfo?.school?.name || 'Unknown School',
                    classRepName: user?.name || 'Unknown User',
                    classRepEmail: user?.email || 'Unknown Email',
                    designId: design.id
                })
            );

            await Promise.allSettled(notificationPromises);
        } catch (emailError) {
            console.error('Failed to send back design upload notification:', emailError.message);
        }

        res.json({
            success: true,
            message: shareWithAll
                ? "Back design uploaded and added to country library"
                : "Back design uploaded",
            data: design
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};
export const reUploadClassBackDesign = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { name, isFromConfigurator, designColor, configurator_state, forAllStudents } = req.body;
        const designId = req.params.id;

        if (!classId) return res.status(400).json({ success: false, message: "User not assigned to any class" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const isConfigurator = isFromConfigurator === 'true' || isFromConfigurator === true;
        const shareWithAll = forAllStudents === 'true' || forAllStudents === true;

        if (designColor && !['white', 'black'].includes(designColor.toLowerCase())) {
            return res.status(400).json({ success: false, message: "Invalid design color. Only 'white' or 'black' are allowed." });
        }

        // Parse configurator_state if sent as string
        let parsedState = null;
        if (configurator_state) {
            try {
                parsedState = typeof configurator_state === 'string' ? JSON.parse(configurator_state) : configurator_state;
            } catch (e) {
                parsedState = null;
            }
        }

        // If forAllStudents is true, fetch the class's country_id
        let libraryCountryId = null;
        if (shareWithAll) {
            const classData = await prisma.classes.findUnique({
                where: { id: parseInt(classId) },
                select: { country_id: true }
            });
            libraryCountryId = classData?.country_id || null;
        }

        const design = await prisma.backDesign.update({
            where: { id: parseInt(designId) },
            data: {
                class_id: parseInt(classId),
                name: name || `back_design_${Date.now()}`,
                file_path: req.file.path,
                is_library: shareWithAll,
                forAllStudents: shareWithAll,
                country_id: shareWithAll ? libraryCountryId : null,
                process_status: 'uploaded',
                status: 1,
                isFromConfigurator: isConfigurator,
                designColor: designColor ? designColor.toLowerCase() : null,
                ...(parsedState && { configurator_state: parsedState })
            }
        });

        res.json({ success: true, message: "Back design updated", data: design });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listBackDesigns = async (req, res) => {
    try {
        const { class_id, page = 1, limit = 10, search = '', status: statusFilter } = req.body;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            ...(class_id && { class_id: parseInt(class_id) }),
            ...(statusFilter !== undefined && statusFilter !== '' && { status: parseInt(statusFilter) }),
            ...(search && { OR: [{ name: { contains: search } }] })
        };

        const [results, total] = await Promise.all([
            prisma.backDesign.findMany({
                where, skip, take: limitNum, orderBy: { created_at: 'desc' },
                include: {
                    class: {
                        include: {
                            school: true   // 👈 yahan se school aa jayega
                        }
                    }
                }
            }),
            prisma.backDesign.count({ where })
        ]);

        res.json({ success: true, data: results, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listMyBackDesigns = async (req, res) => {
    try {
        const class_id = req.user?.class_id;
        if (!class_id) return res.json({ success: true, data: [] });

        const designs = await prisma.backDesign.findMany({
            where: { class_id: parseInt(class_id), status: { not: 2 } },
            orderBy: { created_at: 'desc' }
        });
        res.json({ success: true, data: designs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyClassBackDesign = async (req, res) => {
    try {
        const class_id = req.user?.class_id;
        if (!class_id)
            return res.status(400).json({ success: false, message: "User not assigned to any class" });

        // Use findFirst instead of findUnique
        const design = await prisma.backDesign.findFirst({
            where: {
                class_id: parseInt(class_id),
                isFromConfigurator: true,
                status: { not: 2 } // optional: ignore rejected designs
            },
            orderBy: { created_at: 'desc' } // get the latest design
        });

        if (!design) {
            return res.json({ success: true, data: null, message: "No back design found for this class" });
        }

        res.json({ success: true, data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getConfiguratorBackDesign = async (req, res) => {
    try {
        const classId = req.params.classId || req.user?.class_id;
        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "User not assigned to any class"
            });
        }

        const design = await prisma.backDesign.findFirst({
            where: {
                class_id: parseInt(classId),
                class: { status: { not: 2 } }, // ensure class is not deleted
                isFromConfigurator: true,
                status: { not: 2 } // rejected designs ko ignore karo
            },
            include: {
                class: true
            },
            orderBy: { created_at: 'desc' }
        });

        if (!design) {
            return res.json({
                success: true,
                message: "No configurator back design found",
                data: null
            });
        }

        res.json({ success: true, data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const approveBackDesign = async (req, res) => {
    try {
        const { id } = req.params;

        const design = await prisma.backDesign.findUnique({
            where: { id: parseInt(id) },
            include: {
                class: {
                    include: {
                        users: {
                            where: { role: 'class_representative', status: { not: 2 } },
                            select: { name: true, email: true },
                            take: 1
                        }
                    }
                }
            }
        });

        if (!design) return res.status(404).json({ success: false, message: "Back design not found" });

        await prisma.backDesign.update({
            where: { id: parseInt(id) },
            data: { process_status: 'approved', status: 0 }
        });

        // Send approval email to class rep
        try {
            const classRep = design.class?.users?.[0];
            if (classRep?.email) {
                await sendBackDesignStatusEmail({
                    email: classRep.email,
                    uploaderName: classRep.name,
                    designName: design.name,
                    status: 'approved',
                    adminComment: null
                });
            }
        } catch (emailErr) {
            console.error('Back design approval email failed:', emailErr.message);
        }

        res.json({ success: true, message: "Back design approved" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const rejectBackDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment, reason } = req.body;
        const adminComment = comment || reason || null;

        const design = await prisma.backDesign.findUnique({
            where: { id: parseInt(id) },
            include: {
                class: {
                    include: {
                        users: {
                            where: { role: 'class_representative', status: { not: 2 } },
                            select: { name: true, email: true },
                            take: 1
                        }
                    }
                }
            }
        });

        if (!design) return res.status(404).json({ success: false, message: "Back design not found" });

        await prisma.backDesign.update({
            where: { id: parseInt(id) },
            data: { process_status: 'rejected', status: 2, admin_comment: adminComment }
        });

        // Send rejection email to class rep
        try {
            const classRep = design.class?.users?.[0];
            if (classRep?.email) {
                await sendBackDesignStatusEmail({
                    email: classRep.email,
                    uploaderName: classRep.name,
                    designName: design.name,
                    status: 'rejected',
                    adminComment
                });
            }
        } catch (emailErr) {
            console.error('Back design rejection email failed:', emailErr.message);
        }

        res.json({ success: true, message: "Back design rejected" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getClassBackDesigns = async (req, res) => {
    try {
        const { classId } = req.params;

        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "Class ID is required"
            });
        }

        const designs = await prisma.backDesign.findMany({
            where: {
                class_id: parseInt(classId),
                status: { not: 2 } // rejected designs ko exclude karo
            },
            orderBy: { created_at: 'desc' }
        });

        res.json({
            success: true,
            data: designs,
            count: designs.length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get all available study trip countries from DB
export const getStudyTripCountries = async (req, res) => {
    try {
        const countries = await prisma.country.findMany({
            where: { status: 0 },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, code: true, status: true }
        });
        res.json({ success: true, data: countries });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: upload a library design with country_id
export const uploadLibraryDesign = async (req, res) => {
    try {
        const { name, country_id, designColor } = req.body;

        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
        if (!country_id) return res.status(400).json({ success: false, message: "country_id is required" });

        const country = await prisma.country.findUnique({ where: { id: parseInt(country_id) } });
        if (!country) return res.status(404).json({ success: false, message: "Country not found" });

        const design = await prisma.backDesign.create({
            data: {
                name: name || `library_${country.name}_${Date.now()}`,
                file_path: req.file.path,
                is_library: true,
                country_id: parseInt(country_id),
                designColor: designColor || null,
                process_status: 'approved',
                status: 0
            }
        });

        res.json({ success: true, message: "Library design uploaded", data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get library designs filtered by country_id
export const getLibraryDesignsByCountry = async (req, res) => {
    try {
        const { country_id } = req.query;

        const where = {
            is_library: true,
            status: 0,
            process_status: 'approved',
            ...(country_id && { country_id: parseInt(country_id) })
        };

        const designs = await prisma.backDesign.findMany({
            where,
            include: { country: { select: { name: true, code: true } } },
            orderBy: { created_at: 'desc' }
        });

        res.json({ success: true, data: designs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: set study trip country on their class
export const setClassStudyTripCountry = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { country_id } = req.body;

        if (!classId) return res.status(400).json({ success: false, message: "No class assigned" });
        if (!country_id) return res.status(400).json({ success: false, message: "country_id is required" });

        const country = await prisma.country.findUnique({ where: { id: parseInt(country_id) } });
        if (!country) return res.status(404).json({ success: false, message: "Country not found" });

        const updated = await prisma.classes.update({
            where: { id: parseInt(classId) },
            data: { country_id: parseInt(country_id) }
        });

        res.json({ success: true, message: `Study trip country set to ${country.name}`, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: get library designs for their class's study trip country
export const getLibraryDesignsForMyClass = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) return res.status(400).json({ success: false, message: "No class assigned" });

        const classData = await prisma.classes.findUnique({
            where: { id: parseInt(classId) },
            select: { country_id: true, country: { select: { name: true, code: true } } }
        });

        const where = {
            is_library: true,
            status: 0,
            process_status: 'approved',
            ...(classData?.country_id && { country_id: classData.country_id })
        };

        const designs = await prisma.backDesign.findMany({
            where,
            include: { country: { select: { name: true, code: true } } },
            orderBy: { created_at: 'desc' }
        });

        res.json({
            success: true,
            country: classData?.country || null,
            data: designs
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: delete their own back design (soft delete)
export const deleteMyBackDesign = async (req, res) => {
    try {
        const { designId } = req.params;
        const classId = req.user.class_id;

        const design = await prisma.backDesign.findUnique({ where: { id: parseInt(designId) } });
        if (!design) return res.status(404).json({ success: false, message: "Design not found" });
        if (design.class_id !== classId) return res.status(403).json({ success: false, message: "Unauthorized" });

        await prisma.backDesign.delete({ where: { id: parseInt(designId) } });
        res.json({ success: true, message: "Back design deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: edit back design details (name, designColor) without re-uploading file
export const editMyBackDesign = async (req, res) => {
    try {
        const { designId } = req.params;
        const classId = req.user.class_id;
        const { name, designColor } = req.body;

        if (!classId) return res.status(400).json({ success: false, message: "No class assigned" });

        const design = await prisma.backDesign.findUnique({ where: { id: parseInt(designId) } });
        if (!design) return res.status(404).json({ success: false, message: "Design not found" });
        if (design.class_id !== classId) return res.status(403).json({ success: false, message: "Unauthorized" });

        if (designColor && !['white', 'black'].includes(designColor.toLowerCase())) {
            return res.status(400).json({ success: false, message: "designColor must be 'white' or 'black'" });
        }

        const updated = await prisma.backDesign.update({
            where: { id: parseInt(designId) },
            data: {
                ...(name && { name }),
                ...(designColor && { designColor: designColor.toLowerCase() }),
                process_status: 'uploaded', // reset to pending review
                status: 1
            }
        });

        res.json({ success: true, message: "Design updated", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: save configurator state (draft — before final submit)
export const saveConfiguratorState = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { configurator_state, designColor, name } = req.body;

        if (!classId) return res.status(400).json({ success: false, message: "No class assigned" });
        if (!configurator_state) return res.status(400).json({ success: false, message: "configurator_state is required" });

        // Find existing draft or configurator design for this class
        let design = await prisma.backDesign.findFirst({
            where: { class_id: parseInt(classId), isFromConfigurator: true, status: { not: 2 } }
        });

        if (design) {
            design = await prisma.backDesign.update({
                where: { id: design.id },
                data: {
                    configurator_state,
                    ...(designColor && { designColor }),
                    ...(name && { name })
                }
            });
        } else {
            design = await prisma.backDesign.create({
                data: {
                    class_id: parseInt(classId),
                    name: name || `configurator_draft_${Date.now()}`,
                    file_path: '',
                    is_library: false,
                    isFromConfigurator: true,
                    configurator_state,
                    designColor: designColor || null,
                    process_status: 'uploaded',
                    status: 1
                }
            });
        }

        res.json({ success: true, message: "Configurator state saved", data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: load saved configurator state
export const loadConfiguratorState = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) return res.status(400).json({ success: false, message: "No class assigned" });

        const design = await prisma.backDesign.findFirst({
            where: { class_id: parseInt(classId), isFromConfigurator: true, status: { not: 2 } },
            orderBy: { created_at: 'desc' }
        });

        res.json({ success: true, data: design || null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
// Admin: delete any back design (soft delete)
export const adminDeleteBackDesign = async (req, res) => {
    try {
        const { designId } = req.params;

        const design = await prisma.backDesign.findUnique({
            where: { id: parseInt(designId) },
            include: {
                class: { select: { name: true } },
                country: { select: { name: true } }
            }
        });

        if (!design) {
            return res.status(404).json({ success: false, message: "Back design not found" });
        }

        if (design.status === 2) {
            return res.status(400).json({ success: false, message: "Back design is already deleted" });
        }

        // Check if design is being used as active back design for any class
        const activeClasses = await prisma.classes.count({
            where: {
                back_design_id: parseInt(designId),
                status: { not: 2 }
            }
        });

        if (activeClasses > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete back design. It is currently set as active design for ${activeClasses} class(es)`
            });
        }

        await prisma.backDesign.update({
            where: { id: parseInt(designId) },
            data: { status: 2 }
        });

        const location = design.class ? `class "${design.class.name}"` :
            design.country ? `country "${design.country.name}"` : 'library';

        res.json({
            success: true,
            message: `Back design "${design.name}" from ${location} has been deleted`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: permanently delete back design (hard delete with file removal)
export const adminPermanentDeleteBackDesign = async (req, res) => {
    try {
        const { designId } = req.params;
        const { confirm } = req.body;

        if (confirm !== 'DELETE') {
            return res.status(400).json({
                success: false,
                message: "Please confirm deletion by sending 'confirm: DELETE' in request body"
            });
        }

        const design = await prisma.backDesign.findUnique({
            where: { id: parseInt(designId) },
            include: {
                class: { select: { name: true } },
                country: { select: { name: true } }
            }
        });

        if (!design) {
            return res.status(404).json({ success: false, message: "Back design not found" });
        }

        // Check if design is being used by any classes (including deleted ones)
        const anyClasses = await prisma.classes.count({
            where: { back_design_id: parseInt(designId) }
        });

        if (anyClasses > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot permanently delete back design. It is referenced by ${anyClasses} class(es). Use soft delete instead.`
            });
        }

        // Delete file from filesystem
        try {
            const fs = await import('fs');
            if (fs.existsSync(design.file_path)) {
                fs.unlinkSync(design.file_path);
            }
        } catch (fileError) {
            console.warn(`Warning: Could not delete file ${design.file_path}:`, fileError.message);
        }

        // Delete from database
        await prisma.backDesign.delete({ where: { id: parseInt(designId) } });

        const location = design.class ? `class "${design.class.name}"` :
            design.country ? `country "${design.country.name}"` : 'library';

        res.json({
            success: true,
            message: `Back design "${design.name}" from ${location} has been permanently deleted`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
// Admin: delete library design (soft delete)
export const adminDeleteLibraryDesign = async (req, res) => {
    try {
        const { designId } = req.params;

        const design = await prisma.backDesign.findUnique({
            where: { id: parseInt(designId) },
            include: {
                country: { select: { name: true } }
            }
        });

        if (!design) {
            return res.status(404).json({ success: false, message: "Library design not found" });
        }

        if (!design.is_library) {
            return res.status(400).json({ success: false, message: "This is not a library design" });
        }

        if (design.status === 2) {
            return res.status(400).json({ success: false, message: "Library design is already deleted" });
        }

        // Check if design is being used as active back design for any class
        const activeClasses = await prisma.classes.count({
            where: {
                back_design_id: parseInt(designId),
                status: { not: 2 }
            }
        });

        if (activeClasses > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete library design. It is currently set as active design for ${activeClasses} class(es)`
            });
        }

        await prisma.backDesign.update({
            where: { id: parseInt(designId) },
            data: { status: 2 }
        });

        const location = design.country ? `country "${design.country.name}"` : 'library';

        res.json({
            success: true,
            message: `Library design "${design.name}" from ${location} has been deleted`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: permanently delete library design (hard delete with file removal)
export const adminPermanentDeleteLibraryDesign = async (req, res) => {
    try {
        const { designId } = req.params;
        const { confirm } = req.body;

        if (confirm !== 'DELETE') {
            return res.status(400).json({
                success: false,
                message: "Please confirm deletion by sending 'confirm: DELETE' in request body"
            });
        }

        const design = await prisma.backDesign.findUnique({
            where: { id: parseInt(designId) },
            include: {
                country: { select: { name: true } }
            }
        });

        if (!design) {
            return res.status(404).json({ success: false, message: "Library design not found" });
        }

        if (!design.is_library) {
            return res.status(400).json({ success: false, message: "This is not a library design" });
        }

        // Check if design is being used by any classes (including deleted ones)
        const anyClasses = await prisma.classes.count({
            where: { back_design_id: parseInt(designId) }
        });

        if (anyClasses > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot permanently delete library design. It is referenced by ${anyClasses} class(es). Use soft delete instead.`
            });
        }

        // Delete file from filesystem
        try {
            const fs = await import('fs');
            if (fs.existsSync(design.file_path)) {
                fs.unlinkSync(design.file_path);
            }
        } catch (fileError) {
            console.warn(`Warning: Could not delete file ${design.file_path}:`, fileError.message);
        }

        // Delete from database
        await prisma.backDesign.delete({ where: { id: parseInt(designId) } });

        const location = design.country ? `country "${design.country.name}"` : 'library';

        res.json({
            success: true,
            message: `Library design "${design.name}" from ${location} has been permanently deleted`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
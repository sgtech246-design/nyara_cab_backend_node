import { getAllPartnersAdmin, getAdminStats } from '../services/partnerService.js';
import { getDb } from '../config/db.js';
import { deletePostImageFiles } from '../utils/fileUtils.js';

export async function getPartners(req, res, next) {
  try {
    const { page = 1, limit = 15, search = '', status = '' } = req.query;

    const result = await getAllPartnersAdmin({
      page,
      limit,
      search,
      status,
    });

    res.json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  } catch (err) {
    next(err);
  }
}

export async function getStats(req, res, next) {
  try {
    const stats = await getAdminStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    next(err);
  }
}

export async function togglePartnerStatus(req, res, next) {
  try {
    const { id } = req.params;
    const db = await getDb();

    const partner = await db.get('SELECT * FROM partners WHERE id = ?', [id]);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found',
      });
    }

    res.json({
      success: true,
      message: 'Partner details retrieved successfully',
      data: partner,
    });
  } catch (err) {
    next(err);
  }
}

export async function deletePartner(req, res, next) {
  try {
    const { id } = req.params;
    const db = await getDb();

    const partner = await db.get('SELECT * FROM partners WHERE id = ?', [id]);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found',
      });
    }

    // Delete partner from DB
    await db.run('DELETE FROM partners WHERE id = ?', [id]);
    if (partner.phone_number) {
      await db.run('DELETE FROM otp_verifications WHERE phone_number = ?', [partner.phone_number]);
    }

    res.json({
      success: true,
      message: 'Partner permanently deleted from database',
    });
  } catch (err) {
    next(err);
  }
}

export async function getMarketplacePostsAdmin(req, res, next) {
  try {
    const { page = 1, limit = 15, search = '' } = req.query;
    const db = await getDb();
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(p.description LIKE ? OR part.full_name LIKE ? OR part.phone_number LIKE ? OR part.city LIKE ?)');
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await db.get(
      `SELECT COUNT(*) as total FROM marketplace_posts p LEFT JOIN partners part ON p.user_id = part.id ${whereSql}`,
      params
    );
    const total = countRow ? countRow.total : 0;

    const posts = await db.all(
      `SELECT 
        p.id,
        p.user_id,
        p.description,
        p.phone_number,
        p.images,
        p.likes_count,
        p.saves_count,
        p.created_at,
        part.full_name AS author_name,
        part.business_name AS agency_name,
        part.profile_image AS author_avatar,
        part.city AS location
       FROM marketplace_posts p
       LEFT JOIN partners part ON p.user_id = part.id
       ${whereSql}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    const formattedPosts = posts.map((post) => {
      let imageList = [];
      if (post.images) {
        try {
          imageList = typeof post.images === 'string' ? JSON.parse(post.images) : post.images;
        } catch (_) {
          if (typeof post.images === 'string' && post.images.trim().length > 0) {
            imageList = [post.images];
          }
        }
      }
      return {
        ...post,
        images: imageList,
      };
    });

    res.json({
      success: true,
      data: formattedPosts,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteMarketplacePostAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const db = await getDb();

    const post = await db.get('SELECT * FROM marketplace_posts WHERE id = ?', [id]);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Marketplace post not found',
      });
    }

    // 1. Delete image files from upload directory on disk
    deletePostImageFiles(post.images);

    // 2. Delete post and all associated entries from DB
    await db.run('DELETE FROM marketplace_posts WHERE id = ?', [id]);
    await db.run('DELETE FROM marketplace_post_likes WHERE post_id = ?', [id]);
    await db.run('DELETE FROM marketplace_post_saves WHERE post_id = ?', [id]);
    await db.run('DELETE FROM marketplace_reported_posts WHERE post_id = ?', [id]);
    await db.run('DELETE FROM notifications WHERE post_id = ?', [id]);

    res.json({
      success: true,
      message: 'Marketplace post and attached images permanently deleted',
    });
  } catch (err) {
    next(err);
  }
}

export async function getFraudReportsAdmin(req, res, next) {
  try {
    const { page = 1, limit = 15, search = '' } = req.query;
    const db = await getDb();
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(fr.reason LIKE ? OR fr.description LIKE ? OR reporter.full_name LIKE ? OR reported.full_name LIKE ? OR reporter.phone_number LIKE ? OR reported.phone_number LIKE ?)');
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await db.get(
      `SELECT COUNT(*) as total 
       FROM fraud_reports fr
       LEFT JOIN partners reporter ON fr.reporter_id = reporter.id
       LEFT JOIN partners reported ON fr.reported_user_id = reported.id
       ${whereSql}`,
      params
    );
    const total = countRow ? countRow.total : 0;

    const reports = await db.all(
      `SELECT 
        fr.id,
        fr.reporter_id,
        fr.reported_user_id,
        fr.reason,
        fr.description,
        fr.created_at,
        reporter.full_name AS reporter_name,
        reporter.phone_number AS reporter_phone,
        reporter.business_name AS reporter_business,
        reported.full_name AS reported_name,
        reported.phone_number AS reported_phone,
        reported.business_name AS reported_business,
        reported.profile_image AS reported_avatar
       FROM fraud_reports fr
       LEFT JOIN partners reporter ON fr.reporter_id = reporter.id
       LEFT JOIN partners reported ON fr.reported_user_id = reported.id
       ${whereSql}
       ORDER BY fr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    res.json({
      success: true,
      data: reports,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteFraudReportAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM fraud_reports WHERE id = ?', [id]);
    res.json({
      success: true,
      message: 'Fraud report dismissed successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function getReportedPostsAdmin(req, res, next) {
  try {
    const { page = 1, limit = 15, search = '' } = req.query;
    const db = await getDb();
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(rp.reason LIKE ? OR p.description LIKE ? OR reporter.full_name LIKE ? OR author.full_name LIKE ? OR reporter.phone_number LIKE ?)');
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await db.get(
      `SELECT COUNT(*) as total 
       FROM marketplace_reported_posts rp
       LEFT JOIN marketplace_posts p ON rp.post_id = p.id
       LEFT JOIN partners reporter ON rp.user_id = reporter.id
       LEFT JOIN partners author ON p.user_id = author.id
       ${whereSql}`,
      params
    );
    const total = countRow ? countRow.total : 0;

    const reports = await db.all(
      `SELECT 
        rp.id,
        rp.post_id,
        rp.user_id AS reporter_id,
        rp.reason,
        rp.created_at,
        reporter.full_name AS reporter_name,
        reporter.phone_number AS reporter_phone,
        reporter.business_name AS reporter_business,
        p.user_id AS post_author_id,
        p.description AS post_description,
        p.images AS post_images,
        p.phone_number AS post_phone,
        author.full_name AS author_name,
        author.business_name AS author_business,
        author.profile_image AS author_avatar
       FROM marketplace_reported_posts rp
       LEFT JOIN marketplace_posts p ON rp.post_id = p.id
       LEFT JOIN partners reporter ON rp.user_id = reporter.id
       LEFT JOIN partners author ON p.user_id = author.id
       ${whereSql}
       ORDER BY rp.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    const formattedReports = reports.map((rep) => {
      let imageList = [];
      if (rep.post_images) {
        try {
          imageList = typeof rep.post_images === 'string' ? JSON.parse(rep.post_images) : rep.post_images;
        } catch (_) {
          if (typeof rep.post_images === 'string' && rep.post_images.trim().length > 0) {
            imageList = [rep.post_images];
          }
        }
      }
      return {
        ...rep,
        post_images: imageList,
      };
    });

    res.json({
      success: true,
      data: formattedReports,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteReportedPostAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM marketplace_reported_posts WHERE id = ?', [id]);
    res.json({
      success: true,
      message: 'Post report dismissed successfully',
    });
  } catch (err) {
    next(err);
  }
}



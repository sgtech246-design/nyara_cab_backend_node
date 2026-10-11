import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../config/db.js';
import { deletePostImageFiles } from '../utils/fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Get all Marketplace Posts
 */
export async function getMarketplacePosts(req, res) {
  try {
    const db = await getDb();
    const currentUserId = req.query.user_id || 0;
    const authorId = req.query.author_id || req.query.filter_user_id || null;
    const onlySaved = req.query.only_saved === 'true' || req.query.saved === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let whereParams = [];

    if (authorId) {
      whereClauses.push('p.user_id = ?');
      whereParams.push(authorId);
    }

    if (onlySaved && currentUserId) {
      whereClauses.push('p.id IN (SELECT post_id FROM marketplace_post_saves WHERE user_id = ?)');
      whereParams.push(currentUserId);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const totalObj = await db.get(`SELECT COUNT(*) as count FROM marketplace_posts p ${whereSql}`, whereParams);
    const totalPosts = totalObj ? totalObj.count : 0;

    const posts = await db.all(`
      SELECT 
        p.id,
        p.user_id,
        p.description,
        p.images,
        p.phone_number,
        p.likes_count,
        p.saves_count,
        p.created_at,
        part.full_name AS author_name,
        part.business_name AS agency_name,
        part.profile_image AS author_avatar,
        part.created_at AS member_since,
        (SELECT COUNT(*) FROM marketplace_post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ?) > 0 AS is_liked,
        (SELECT pl_r.reaction FROM marketplace_post_likes pl_r WHERE pl_r.post_id = p.id AND pl_r.user_id = ? LIMIT 1) AS user_reaction,
        (SELECT COUNT(*) FROM marketplace_post_saves ps WHERE ps.post_id = p.id AND ps.user_id = ?) > 0 AS is_saved
      FROM marketplace_posts p
      LEFT JOIN partners part ON p.user_id = part.id
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [currentUserId, currentUserId, currentUserId, ...whereParams, limit, offset]);

    const formattedPosts = posts.map(post => {
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
        id: post.id.toString(),
        user_id: post.user_id,
        author_name: post.author_name || 'Nyara Partner',
        agency_name: post.agency_name || post.author_name || 'Taxi Service',
        location: post.location || 'Gujarat, India',
        author_avatar: post.author_avatar || '',
        time_ago: timeAgo(post.created_at),
        created_at: post.created_at,
        description: post.description || '',
        phone_number: post.phone_number || '',
        images: imageList,
        likes_count: post.likes_count || 0,
        saves_count: post.saves_count || 0,
        is_liked: Boolean(post.is_liked),
        user_reaction: post.user_reaction || '👍',
        is_saved: Boolean(post.is_saved),
      };
    });

    const hasMore = offset + posts.length < totalPosts;

    return res.status(200).json({
      success: true,
      page,
      limit,
      has_more: hasMore,
      total_posts: totalPosts,
      data: formattedPosts,
    });
  } catch (error) {
    console.error('❌ Error fetching marketplace posts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch marketplace posts',
      error: error.message,
    });
  }
}

/**
 * Get Single Marketplace Post by ID
 */
export async function getSingleMarketplacePost(req, res) {
  try {
    const postId = req.params.id;
    const currentUserId = req.query.user_id || 0;
    const db = await getDb();

    const post = await db.get(`
      SELECT 
        p.id,
        p.user_id,
        p.description,
        p.images,
        p.phone_number,
        p.likes_count,
        p.saves_count,
        p.created_at,
        part.full_name AS author_name,
        part.business_name AS agency_name,
        part.profile_image AS author_avatar,
        part.created_at AS member_since,
        (SELECT COUNT(*) FROM marketplace_post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ?) > 0 AS is_liked,
        (SELECT pl_r.reaction FROM marketplace_post_likes pl_r WHERE pl_r.post_id = p.id AND pl_r.user_id = ? LIMIT 1) AS user_reaction,
        (SELECT COUNT(*) FROM marketplace_post_saves ps WHERE ps.post_id = p.id AND ps.user_id = ?) > 0 AS is_saved
      FROM marketplace_posts p
      LEFT JOIN partners part ON p.user_id = part.id
      WHERE p.id = ?
    `, [currentUserId, currentUserId, currentUserId, postId]);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

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

    return res.status(200).json({
      success: true,
      data: {
        id: post.id.toString(),
        user_id: post.user_id,
        author_name: post.author_name || 'Nyara Partner',
        agency_name: post.agency_name || post.author_name || 'Taxi Service',
        location: post.location || 'Gujarat, India',
        author_avatar: post.author_avatar || '',
        time_ago: timeAgo(post.created_at),
        created_at: post.created_at,
        description: post.description || '',
        phone_number: post.phone_number || '',
        images: imageList,
        likes_count: post.likes_count || 0,
        saves_count: post.saves_count || 0,
        is_liked: Boolean(post.is_liked),
        user_reaction: post.user_reaction || '👍',
        is_saved: Boolean(post.is_saved),
      },
    });
  } catch (error) {
    console.error('❌ Error fetching single post:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch post' });
  }
}

/**
 * Create a new Marketplace Post (with up to 5 images)
 */
export async function createMarketplacePost(req, res) {
  try {
    const { user_id, description, phone_number, images } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
      });
    }

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least 1 image is required to publish a post.',
      });
    }

    const db = await getDb();

    // Fetch partner phone if not provided
    let partnerPhone = phone_number || '';
    if (!partnerPhone) {
      const partner = await db.get('SELECT phone_number FROM partners WHERE id = ?', [user_id]);
      if (partner) partnerPhone = partner.phone_number || '';
    }

    const host = req.get('host') || '10.150.193.73:5000';
    const protocol = req.protocol || 'http';
    const savedImageUrls = [];

    const marketplaceDir = path.join(uploadsDir, 'marketplace');
    if (!fs.existsSync(marketplaceDir)) {
      fs.mkdirSync(marketplaceDir, { recursive: true });
    }

    // Save up to 5 images
    const imagesToProcess = images.slice(0, 5);
    for (let i = 0; i < imagesToProcess.length; i++) {
      const imgItem = imagesToProcess[i];
      if (!imgItem) continue;

      if (imgItem.startsWith('http://') || imgItem.startsWith('https://')) {
        savedImageUrls.push(imgItem);
      } else if (imgItem.startsWith('data:image')) {
        try {
          const matches = imgItem.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const fileName = `marketplace_user_${user_id}_time_${Date.now()}_img_${i + 1}.${ext}`;
            const filePath = path.join(marketplaceDir, fileName);

            fs.writeFileSync(filePath, buffer);
            savedImageUrls.push(`${protocol}://${host}/uploads/marketplace/${fileName}`);
          }
        } catch (err) {
          console.error('Error saving image:', err);
        }
      }
    }

    if (savedImageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Could not process uploaded image(s)',
      });
    }

    const imagesJson = JSON.stringify(savedImageUrls);
    const postDescription = (description || '').trim();

    const result = await db.run(
      `INSERT INTO marketplace_posts (user_id, description, images, phone_number) VALUES (?, ?, ?, ?)`,
      [user_id, postDescription, imagesJson, partnerPhone]
    );

    const newPostId = result.lastID;

    // Fetch newly created post with author details
    const newPost = await db.get(`
      SELECT 
        p.id,
        p.user_id,
        p.description,
        p.images,
        p.phone_number,
        p.likes_count,
        p.created_at,
        part.full_name AS author_name,
        part.business_name AS agency_name,
        part.city AS location,
        part.profile_image AS author_avatar
      FROM marketplace_posts p
      LEFT JOIN partners part ON p.user_id = part.id
      WHERE p.id = ?
    `, [newPostId]);

    return res.status(201).json({
      success: true,
      message: 'Post published successfully!',
      data: {
        id: newPost.id.toString(),
        user_id: newPost.user_id,
        author_name: newPost.author_name || 'Nyara Partner',
        agency_name: newPost.agency_name || newPost.author_name || 'Taxi Service',
        location: newPost.location || 'Gujarat, India',
        author_avatar: newPost.author_avatar || '',
        time_ago: 'Just now',
        created_at: newPost.created_at,
        description: newPost.description,
        phone_number: newPost.phone_number || '',
        images: savedImageUrls,
        likes_count: 0,
        is_liked: false,
        is_saved: false,
      },
    });
  } catch (error) {
    console.error('❌ Error creating marketplace post:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create marketplace post',
      error: error.message,
    });
  }
}

/**
 * Toggle Like on Marketplace Post
 */
export async function toggleLikePost(req, res) {
  try {
    const postId = req.params.id;
    const { user_id, reaction } = req.body;
    const reactionEmoji = reaction || '👍';

    if (!user_id || !postId) {
      return res.status(400).json({ success: false, message: 'user_id and post id are required' });
    }

    const db = await getDb();

    // Check if already liked
    const existingLike = await db.get(
      `SELECT id, reaction FROM marketplace_post_likes WHERE post_id = ? AND user_id = ?`,
      [postId, user_id]
    );

    let isLiked = false;
    let finalReaction = reactionEmoji;

    if (existingLike) {
      if (reaction) {
        // If reaction parameter passed from emoji picker, update/keep reaction emoji and keep post liked
        await db.run(
          `UPDATE marketplace_post_likes SET reaction = ? WHERE post_id = ? AND user_id = ?`,
          [reactionEmoji, postId, user_id]
        );
        isLiked = true;
        finalReaction = reactionEmoji;
      } else {
        // Direct tap on liked post (no reaction parameter passed) -> remove like
        await db.run(`DELETE FROM marketplace_post_likes WHERE post_id = ? AND user_id = ?`, [postId, user_id]);
        await db.run(`UPDATE marketplace_posts SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END WHERE id = ?`, [postId]);
        isLiked = false;
        finalReaction = '👍';
      }
    } else {
      // Add new like with reaction
      await db.run(
        `INSERT INTO marketplace_post_likes (post_id, user_id, reaction) VALUES (?, ?, ?)`,
        [postId, user_id, reactionEmoji]
      );
      await db.run(`UPDATE marketplace_posts SET likes_count = likes_count + 1 WHERE id = ?`, [postId]);
      isLiked = true;
      finalReaction = reactionEmoji;
    }

    const updatedPost = await db.get(`SELECT likes_count FROM marketplace_posts WHERE id = ?`, [postId]);

    // Create notification entry if liked
    if (isLiked && postId) {
      try {
        const postObj = await db.get(`SELECT user_id FROM marketplace_posts WHERE id = ?`, [postId]);
        const actorObj = await db.get(`SELECT full_name FROM partners WHERE id = ?`, [user_id]);
        const actorName = actorObj ? actorObj.full_name : `User #${user_id}`;

        if (postObj && postObj.user_id) {
          const isSelf = parseInt(postObj.user_id) === parseInt(user_id);
          if (isSelf) {
            await db.run(
              `INSERT INTO notifications (user_id, actor_id, post_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?)`,
              [user_id, user_id, postId, 'like', 'Reaction Recorded', `You reacted ${finalReaction} on your post`]
            );
          } else {
            // Notification for post owner
            await db.run(
              `INSERT INTO notifications (user_id, actor_id, post_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?)`,
              [postObj.user_id, user_id, postId, 'like', 'New Post Reaction', `${actorName} reacted ${finalReaction} on your post`]
            );
            // Notification for actor
            await db.run(
              `INSERT INTO notifications (user_id, actor_id, post_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?)`,
              [user_id, user_id, postId, 'like', 'Reaction Sent', `You reacted ${finalReaction} on post`]
            );
          }
        }
      } catch (nErr) {
        console.error('Error recording notification:', nErr);
      }
    }

    return res.status(200).json({
      success: true,
      is_liked: isLiked,
      user_reaction: finalReaction,
      likes_count: updatedPost ? updatedPost.likes_count : 0,
    });
  } catch (error) {
    console.error('❌ Error toggling like:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle like', error: error.message });
  }
}

/**
 * Get User Notifications
 */
export async function getUserNotifications(req, res) {
  try {
    const userId = parseInt(req.query.user_id) || 0;
    if (!userId) {
      return res.status(200).json({ success: true, unread_count: 0, notifications: [] });
    }

    const db = await getDb();
    const rows = await db.all(`
      SELECT 
        n.id,
        n.user_id,
        n.actor_id,
        n.post_id,
        n.type,
        n.title,
        n.message,
        n.is_read,
        n.created_at,
        p.full_name AS actor_name,
        p.profile_image AS actor_avatar
      FROM notifications n
      LEFT JOIN partners p ON n.actor_id = p.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 30
    `, [userId]);

    const unreadObj = await db.get(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    const formatted = rows.map(n => ({
      id: n.id,
      user_id: n.user_id,
      actor_id: n.actor_id,
      actor_name: n.actor_name || 'Nyara Partner',
      actor_avatar: n.actor_avatar || '',
      post_id: n.post_id,
      type: n.type,
      title: n.title,
      message: n.message,
      is_read: Boolean(n.is_read),
      created_at: n.created_at,
      time_ago: timeAgo(n.created_at),
    }));

    return res.status(200).json({
      success: true,
      unread_count: unreadObj ? unreadObj.count : 0,
      notifications: formatted,
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
}

/**
 * Mark Notifications as Read
 */
export async function markNotificationsRead(req, res) {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id required' });
    }

    const db = await getDb();
    await db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [user_id]);

    return res.status(200).json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    console.error('❌ Error marking notifications as read:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark read' });
  }
}

/**
 * Toggle Save Post
 */
export async function toggleSavePost(req, res) {
  try {
    const postId = req.params.id;
    const { user_id } = req.body;

    if (!user_id || !postId) {
      return res.status(400).json({ success: false, message: 'user_id and post id are required' });
    }

    const db = await getDb();
    const existingSave = await db.get(
      `SELECT id FROM marketplace_post_saves WHERE post_id = ? AND user_id = ?`,
      [postId, user_id]
    );

    let isSaved = false;

    if (existingSave) {
      await db.run(`DELETE FROM marketplace_post_saves WHERE post_id = ? AND user_id = ?`, [postId, user_id]);
      await db.run(`UPDATE marketplace_posts SET saves_count = CASE WHEN saves_count > 0 THEN saves_count - 1 ELSE 0 END WHERE id = ?`, [postId]);
      isSaved = false;
    } else {
      await db.run(
        `INSERT INTO marketplace_post_saves (post_id, user_id) VALUES (?, ?)`,
        [postId, user_id]
      );
      await db.run(`UPDATE marketplace_posts SET saves_count = saves_count + 1 WHERE id = ?`, [postId]);
      isSaved = true;
    }

    const updatedPost = await db.get(`SELECT saves_count FROM marketplace_posts WHERE id = ?`, [postId]);

    return res.status(200).json({
      success: true,
      is_saved: isSaved,
      saves_count: updatedPost ? updatedPost.saves_count : 0,
      message: isSaved ? 'Post saved successfully' : 'Post removed from saved',
    });
  } catch (error) {
    console.error('❌ Error toggling save:', error);
    return res.status(500).json({ success: false, message: 'Failed to save post', error: error.message });
  }
}

/**
 * Report Post
 */
export async function reportPost(req, res) {
  try {
    const postId = req.params.id;
    const { user_id, reason } = req.body;

    if (!user_id || !postId) {
      return res.status(400).json({ success: false, message: 'user_id and post id are required' });
    }

    const db = await getDb();
    await db.run(
      `INSERT INTO marketplace_reported_posts (post_id, user_id, reason) VALUES (?, ?, ?)`,
      [postId, user_id, reason || 'Inappropriate content']
    );

    return res.status(200).json({
      success: true,
      message: 'Post reported successfully. Thank you for keeping our community safe.',
    });
  } catch (error) {
    console.error('❌ Error reporting post:', error);
    return res.status(500).json({ success: false, message: 'Failed to report post', error: error.message });
  }
}

/**
 * Delete Post
 */
export async function deletePost(req, res) {
  try {
    const postId = req.params.id;
    const { user_id } = req.body;

    const db = await getDb();
    const post = await db.get(`SELECT * FROM marketplace_posts WHERE id = ?`, [postId]);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (post.user_id != user_id) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this post' });
    }

    // Unlink image files from disk
    deletePostImageFiles(post.images);

    await db.run(`DELETE FROM marketplace_posts WHERE id = ?`, [postId]);
    await db.run(`DELETE FROM marketplace_post_likes WHERE post_id = ?`, [postId]);
    await db.run(`DELETE FROM marketplace_post_saves WHERE post_id = ?`, [postId]);
    await db.run(`DELETE FROM marketplace_reported_posts WHERE post_id = ?`, [postId]);
    await db.run(`DELETE FROM notifications WHERE post_id = ?`, [postId]);

    return res.status(200).json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    console.error('❌ Error deleting post:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete post', error: error.message });
  }
}

/**
 * Get Partner Profile for "About Profile Name" Dialog
 */
export async function getPartnerProfile(req, res) {
  try {
    const userId = req.params.userId;
    const db = await getDb();

    const partner = await db.get(`
      SELECT 
        id,
        full_name,
        business_name,
        business_description,
        phone_number,
        email,
        city AS address,
        profile_image,
        created_at AS member_since,
        (SELECT COUNT(*) FROM marketplace_posts WHERE user_id = ?) AS total_posts,
        (SELECT COALESCE(SUM(saves_count), 0) FROM marketplace_posts WHERE user_id = ?) AS saved_posts
      FROM partners
      WHERE id = ?
    `, [userId, userId, userId]);

    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found' });
    }

    // Fetch user posts
    const userPosts = await db.all(`
      SELECT 
        p.*,
        part.full_name AS author_name,
        part.business_name AS agency_name,
        part.profile_image AS author_avatar,
        part.city AS location,
        p.likes_count AS likes_count,
        p.saves_count AS saves_count
      FROM marketplace_posts p
      JOIN partners part ON p.user_id = part.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `, [userId]);

    const formattedPosts = userPosts.map((post) => ({
      id: post.id,
      user_id: post.user_id,
      author_name: post.author_name || 'Nyara Partner',
      agency_name: post.agency_name || 'Taxi Service',
      author_avatar: post.author_avatar || '',
      location: post.location || 'Gujarat',
      time_ago: post.created_at ? timeAgo(post.created_at) : 'Just now',
      description: post.description || '',
      images: (() => {
        if (!post.images) return [];
        try {
          return typeof post.images === 'string' ? JSON.parse(post.images) : post.images;
        } catch (_) {
          return [post.images];
        }
      })(),
      likes_count: post.likes_count || 0,
      saves_count: post.saves_count || 0,
    }));

    // Fetch user vehicles
    const nameSearch = `%${partner.full_name || ''}%`;
    const agencySearch = `%${partner.business_name || ''}%`;
    const vehicles = await db.all(`
      SELECT * FROM available_cars 
      WHERE owner_name LIKE ? OR agency LIKE ?
      ORDER BY id DESC
    `, [nameSearch, agencySearch]);

    // Fetch saved posts for this user
    const savedPostsRows = await db.all(`
      SELECT 
        p.*,
        part.full_name AS author_name,
        part.business_name AS agency_name,
        part.profile_image AS author_avatar,
        part.city AS location
      FROM marketplace_post_saves ps
      JOIN marketplace_posts p ON ps.post_id = p.id
      JOIN partners part ON p.user_id = part.id
      WHERE ps.user_id = ?
      ORDER BY ps.created_at DESC
    `, [userId]);

    const formattedSavedPosts = savedPostsRows.map((post) => ({
      id: post.id.toString(),
      user_id: post.user_id,
      author_name: post.author_name || 'Nyara Partner',
      agency_name: post.agency_name || 'Taxi Service',
      author_avatar: post.author_avatar || '',
      location: post.location || 'Gujarat',
      time_ago: post.created_at ? timeAgo(post.created_at) : 'Just now',
      description: post.description || '',
      images: (() => {
        if (!post.images) return [];
        try {
          return typeof post.images === 'string' ? JSON.parse(post.images) : post.images;
        } catch (_) {
          return [post.images];
        }
      })(),
      likes_count: post.likes_count || 0,
      saves_count: post.saves_count || 0,
      is_saved: true,
    }));

    return res.status(200).json({
      success: true,
      data: {
        id: partner.id,
        full_name: partner.full_name || 'Nyara Partner',
        business_name: partner.business_name || partner.full_name || 'Taxi Service',
        business_description: partner.business_description || partner.business_name || 'Taxi Service Partner in Nyara Cab',
        phone_number: partner.phone_number || '',
        email: partner.email || '',
        address: partner.address || 'Gujarat, India',
        profile_image: partner.profile_image || '',
        member_since: partner.member_since ? timeAgo(partner.member_since) : 'Recent',
        total_posts: formattedPosts.length,
        saved_posts: formattedSavedPosts.length,
        vehicles_count: (vehicles || []).length,
        posts: formattedPosts,
        saved_posts_list: formattedSavedPosts,
        vehicles: vehicles || [],
      },
    });
  } catch (error) {
    console.error('❌ Error fetching partner profile:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch partner profile', error: error.message });
  }
}

/**
 * Report Partner for Fraud / Scam
 */
export async function reportFraud(req, res) {
  try {
    const { reporter_id, reported_user_id, reason, description } = req.body;
    if (!reported_user_id) {
      return res.status(400).json({ success: false, message: 'Reported User ID is required' });
    }

    const db = await getDb();
    await db.run(
      `INSERT INTO fraud_reports (reporter_id, reported_user_id, reason, description, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [reporter_id || null, reported_user_id, reason || 'Fraud / Scam', description || '']
    );

    return res.status(200).json({
      success: true,
      message: 'Fraud report submitted successfully. Our team will review it.',
    });
  } catch (error) {
    console.error('❌ Error submitting fraud report:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit fraud report', error: error.message });
  }
}

/**
 * Update an existing Marketplace Post
 */
export async function updateMarketplacePost(req, res) {
  try {
    const { id } = req.params;
    const { user_id, description, images } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }

    const db = await getDb();
    const existingPost = await db.get('SELECT * FROM marketplace_posts WHERE id = ?', [id]);
    if (!existingPost) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (existingPost.user_id != user_id) {
      return res.status(403).json({ success: false, message: 'Unauthorized to edit this post' });
    }

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, message: 'At least 1 image is required.' });
    }

    const host = req.get('host') || '10.150.193.73:5000';
    const protocol = req.protocol || 'http';
    const marketplaceDir = path.join(uploadsDir, 'marketplace');

    if (!fs.existsSync(marketplaceDir)) {
      fs.mkdirSync(marketplaceDir, { recursive: true });
    }

    const savedImageUrls = [];
    const imagesToProcess = images.slice(0, 5);

    for (let i = 0; i < imagesToProcess.length; i++) {
      const imgItem = imagesToProcess[i];
      if (!imgItem) continue;

      if (imgItem.startsWith('http://') || imgItem.startsWith('https://') || imgItem.startsWith('/uploads/')) {
        savedImageUrls.push(imgItem);
      } else if (imgItem.startsWith('data:image')) {
        try {
          const matches = imgItem.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const fileName = `marketplace_user_${user_id}_time_${Date.now()}_img_${i + 1}.${ext}`;
            const filePath = path.join(marketplaceDir, fileName);

            fs.writeFileSync(filePath, buffer);
            savedImageUrls.push(`${protocol}://${host}/uploads/marketplace/${fileName}`);
          }
        } catch (err) {
          console.error('Error saving image in update:', err);
        }
      }
    }

    if (savedImageUrls.length === 0) {
      return res.status(400).json({ success: false, message: 'At least 1 valid image is required.' });
    }

    const postDescription = (description || '').trim();
    const imagesJson = JSON.stringify(savedImageUrls);

    await db.run(
      `UPDATE marketplace_posts SET description = ?, images = ? WHERE id = ?`,
      [postDescription, imagesJson, id]
    );

    return res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      data: {
        id: id.toString(),
        description: postDescription,
        images: savedImageUrls,
      },
    });
  } catch (error) {
    console.error('❌ Error updating marketplace post:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}


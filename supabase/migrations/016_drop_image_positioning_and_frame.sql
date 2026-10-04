-- 016_drop_image_positioning_and_frame.sql
-- Remove cosmetic crop/zoom coordinates and frame from projects table

alter table public.projects 
  drop column if exists image_pos_x,
  drop column if exists image_pos_y,
  drop column if exists image_zoom,
  drop column if exists frame;

-- Re-grant clean update permissions to authenticated creators
revoke update on public.projects from authenticated;
grant update (title, handle, image_path, destination_url, category_id, updated_at) on public.projects to authenticated;

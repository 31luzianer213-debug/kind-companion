REVOKE ALL ON FUNCTION public.backup_client_row() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_deleted_clients(timestamptz) FROM anon;
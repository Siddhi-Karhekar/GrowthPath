from app.core.supabase_client import get_supabase


def create_subject(user_id: str, name: str) -> dict:
    supabase = get_supabase()
    res = supabase.table("subjects").insert({"user_id": user_id, "name": name.strip()}).execute()
    return res.data[0]


def list_subjects(user_id: str) -> list[dict]:
    supabase = get_supabase()
    res = (
        supabase.table("subjects")
        .select("id, name, created_at")
        .eq("user_id", user_id)
        .order("name")
        .execute()
    )
    return res.data or []


def rename_subject(user_id: str, subject_id: str, name: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("subjects")
        .update({"name": name.strip()})
        .eq("id", subject_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise ValueError("Subject not found")
    return res.data[0]


def delete_subject(user_id: str, subject_id: str) -> None:
    """Documents in this subject are NOT deleted - their subject_id just
    reverts to null (Uncategorized), via the FK's ON DELETE SET NULL."""
    supabase = get_supabase()
    supabase.table("subjects").delete().eq("id", subject_id).eq("user_id", user_id).execute()

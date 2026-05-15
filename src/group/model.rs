use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub order: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MoveGroupRequest {
    pub parent_id: Option<String>,
    pub order: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_roundtrips_through_json() {
        let g = Group {
            id: "g-1".into(),
            name: "业务A".into(),
            parent_id: None,
            color: Some("#f59e0b".into()),
            icon: Some("🛒".into()),
            description: Some("Order team".into()),
            order: 1024,
        };
        let json = serde_json::to_string(&g).unwrap();
        let back: Group = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "g-1");
        assert_eq!(back.name, "业务A");
        assert_eq!(back.color.as_deref(), Some("#f59e0b"));
        assert_eq!(back.icon.as_deref(), Some("🛒"));
        assert_eq!(back.order, 1024);
    }

    #[test]
    fn nested_group_serializes_parent_id() {
        let parent = Group {
            id: "p".into(),
            name: "root".into(),
            parent_id: None,
            color: None,
            icon: None,
            description: None,
            order: 0,
        };
        let child = Group {
            id: "c".into(),
            name: "child".into(),
            parent_id: Some(parent.id.clone()),
            color: None,
            icon: None,
            description: None,
            order: 0,
        };
        let json = serde_json::to_string(&child).unwrap();
        assert!(json.contains("\"parent_id\":\"p\""));
    }
}

// Rust fixture
use std::error::Error;

pub struct UserService {
    repo: Box<dyn Repository>,
}

pub enum UserRole {
    Admin,
    User,
    Guest,
}

pub trait Repository {
    fn find_by_id(&self, id: &str) -> Option<User>;
    fn save(&self, user: &User) -> Result<(), Box<dyn Error>>;
}

impl UserService {
    pub fn new(repo: Box<dyn Repository>) -> Self {
        UserService { repo }
    }

    pub fn get_user(&self, id: &str) -> Option<User> {
        self.repo.find_by_id(id)
    }

    pub async fn create_user(&self, data: CreateUserDto) -> Result<User, Box<dyn Error>> {
        let user = User { id: data.id };
        self.repo.save(&user)?;
        Ok(user)
    }
}

pub fn hash_password(password: &str) -> String {
    password.to_string()
}

# Ruby fixture

module Services
  class UserService
    def initialize(repo)
      @repo = repo
    end

    def get_user(id)
      @repo.find(id)
    end

    def create_user(data)
      @repo.save(User.new(data))
    end

    def self.build(repo)
      new(repo)
    end

    private

    def _validate(user)
      !user.nil?
    end
  end
end

def hash_password(password)
  password
end

<?php

namespace Example;

class UserService
{
    private $repo;

    public function __construct(UserRepository $repo)
    {
        $this->repo = $repo;
    }

    public function getUser(string $id): ?User
    {
        return $this->repo->findById($id);
    }

    public function createUser(array $data): User
    {
        return $this->repo->save(new User($data));
    }

    protected function validateUser(User $user): bool
    {
        return !empty($user->id);
    }
}

interface Repository
{
    public function findById(string $id): mixed;
    public function save(mixed $entity): mixed;
}

function hashPassword(string $password): string
{
    return $password;
}

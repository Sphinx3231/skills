using System.IO;
using NinjaGame.AI;
using NinjaGame.Interaction;
using NinjaGame.Player;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace NinjaGame.Editor
{
    /// <summary>
    /// Headless scene-construction utility for the project's Sandbox scenes.
    /// Run via:
    /// Unity.exe -batchmode -nographics -projectPath NinjaGame
    ///   -executeMethod NinjaGame.Editor.SandboxSceneBuilder.BuildPlayerMovementSandbox
    ///   -quit -logFile <log>
    /// (or BuildGuardPerceptionSandbox for the guard-focused scene, or
    /// BuildTakedownSandbox for the stealth-takedown scene)
    /// </summary>
    public static class SandboxSceneBuilder
    {
        private const string ScenePath = "Assets/Scenes/Sandbox/PlayerMovementSandbox.unity";
        private const string GuardScenePath = "Assets/Scenes/Sandbox/GuardPerceptionSandbox.unity";
        private const string TakedownScenePath = "Assets/Scenes/Sandbox/TakedownSandbox.unity";
        private const string PlaceholderSpritePath = "Assets/Art/Sprites/PlaceholderSquare.png";
        private const string ObstacleLayerName = "Obstacle";

        public static void BuildPlayerMovementSandbox()
        {
            Sprite placeholderSprite = GetOrCreatePlaceholderSprite();

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            CreatePlayer(placeholderSprite);
            CreateWall("Wall_North", new Vector2(0f, 4f), new Vector2(8f, 1f), 0);
            CreateWall("Wall_East", new Vector2(5f, 0f), new Vector2(1f, 8f), 0);

            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            bool saved = EditorSceneManager.SaveScene(scene, ScenePath);

            Debug.Log(saved ? "SANDBOX_SCENE_BUILT_OK" : "SANDBOX_SCENE_BUILD_FAILED");
        }

        /// <summary>
        /// Builds a dedicated Sandbox scene for guard perception/FSM exercise:
        /// player, two walls on the Obstacle layer (so Linecast occlusion is
        /// meaningful), and a patrolling guard with GuardPerception + GuardStateMachine.
        /// Kept separate from PlayerMovementSandbox so the original player-movement
        /// task's scene is untouched (no regression risk to that task's QA baseline).
        /// </summary>
        public static void BuildGuardPerceptionSandbox()
        {
            Sprite placeholderSprite = GetOrCreatePlaceholderSprite();

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            int obstacleLayer = LayerMask.NameToLayer(ObstacleLayerName);
            if (obstacleLayer < 0)
            {
                Debug.LogError("GUARD_SANDBOX_SCENE_BUILD_FAILED: 'Obstacle' layer not found in TagManager.");
                return;
            }

            GameObject player = CreatePlayer(placeholderSprite);
            // Moved off CreatePlayer's default (0,0) so Wall_East genuinely sits between
            // the guard's patrol lane (x=-3) and the player's default spawn — see
            // CreateGuard's waypoint placement below for the matching geometry.
            player.transform.position = new Vector3(7f, 0f, 0f);

            CreateWall("Wall_North", new Vector2(0f, 4f), new Vector2(8f, 1f), obstacleLayer);
            CreateWall("Wall_East", new Vector2(5f, 0f), new Vector2(1f, 8f), obstacleLayer);
            CreateGuard(placeholderSprite, player, obstacleLayer);

            Directory.CreateDirectory(Path.GetDirectoryName(GuardScenePath));
            bool saved = EditorSceneManager.SaveScene(scene, GuardScenePath);

            Debug.Log(saved ? "GUARD_SANDBOX_SCENE_BUILT_OK" : "GUARD_SANDBOX_SCENE_BUILD_FAILED");
        }

        /// <summary>
        /// Builds a dedicated Sandbox scene for the stealth-takedown interaction:
        /// a single wall (kept for scene-composition parity with the other Sandbox
        /// scenes; not load-bearing for the takedown itself), and a Patrol-state
        /// guard with the player positioned within PlayerTakedown's interactionRange
        /// and directly behind the guard's facing direction, so a takedown is
        /// immediately reachable in Play Mode. Kept separate from
        /// GuardPerceptionSandbox so that task's scene/QA baseline is untouched.
        /// </summary>
        public static void BuildTakedownSandbox()
        {
            Sprite placeholderSprite = GetOrCreatePlaceholderSprite();

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            int obstacleLayer = LayerMask.NameToLayer(ObstacleLayerName);
            if (obstacleLayer < 0)
            {
                Debug.LogError("TAKEDOWN_SANDBOX_SCENE_BUILD_FAILED: 'Obstacle' layer not found in TagManager.");
                return;
            }

            GameObject player = CreatePlayer(placeholderSprite);
            player.AddComponent<PlayerTakedown>();

            CreateWall("Wall_North", new Vector2(0f, 6f), new Vector2(8f, 1f), obstacleLayer);

            GameObject guard = CreateGuard(placeholderSprite, player, obstacleLayer);

            // Guard's default FacingDirection (set by GuardPerception's serialized
            // default) is Vector2.up, unchanged here since the scene isn't run
            // through Play Mode at build time. Position the player 1 unit directly
            // "south" of the guard (opposite the facing direction) so it sits
            // within PlayerTakedown's default 1.5-unit interactionRange and within
            // the default 60-degree behindAngleThreshold of directly-behind.
            player.transform.position = guard.transform.position + new Vector3(0f, -1f, 0f);

            Directory.CreateDirectory(Path.GetDirectoryName(TakedownScenePath));
            bool saved = EditorSceneManager.SaveScene(scene, TakedownScenePath);

            Debug.Log(saved ? "TAKEDOWN_SANDBOX_SCENE_BUILT_OK" : "TAKEDOWN_SANDBOX_SCENE_BUILD_FAILED");
        }

        private static GameObject CreatePlayer(Sprite sprite)
        {
            var player = new GameObject("Player");

            var spriteRenderer = player.AddComponent<SpriteRenderer>();
            spriteRenderer.sprite = sprite;

            // PlayerMovement's [RequireComponent(typeof(Rigidbody2D))] auto-adds the Rigidbody2D.
            var movement = player.AddComponent<PlayerMovement>();
            player.AddComponent<PlayerStealthState>();

            var rb = player.GetComponent<Rigidbody2D>();
            rb.bodyType = RigidbodyType2D.Dynamic;
            rb.gravityScale = 0f;
            rb.constraints = RigidbodyConstraints2D.FreezeRotation;
            rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;

            var collider = player.AddComponent<BoxCollider2D>();
            collider.size = Vector2.one;

            player.transform.position = Vector3.zero;

            return player;
        }

        private static void CreateWall(string name, Vector2 position, Vector2 size, int layer)
        {
            var wall = new GameObject(name);
            wall.layer = layer;
            wall.transform.position = position;

            var collider = wall.AddComponent<BoxCollider2D>();
            collider.size = size;

            var spriteRenderer = wall.AddComponent<SpriteRenderer>();
            spriteRenderer.sprite = GetOrCreatePlaceholderSprite();
            spriteRenderer.color = Color.gray;
            wall.transform.localScale = new Vector3(size.x, size.y, 1f);
        }

        private static GameObject CreateGuard(Sprite sprite, GameObject player, int obstacleLayer)
        {
            var waypointA = new GameObject("Guard_Waypoint_A");
            waypointA.transform.position = new Vector2(-3f, -3f);

            var waypointB = new GameObject("Guard_Waypoint_B");
            waypointB.transform.position = new Vector2(-3f, 3f);

            var guard = new GameObject("Guard");
            guard.transform.position = waypointA.transform.position;

            var spriteRenderer = guard.AddComponent<SpriteRenderer>();
            spriteRenderer.sprite = sprite;
            spriteRenderer.color = Color.red;

            // GuardStateMachine's [RequireComponent(typeof(Rigidbody2D))] auto-adds the Rigidbody2D.
            var perception = guard.AddComponent<GuardPerception>();
            perception.Player = player.transform;
            perception.PlayerStealthState = player.GetComponent<PlayerStealthState>();
            perception.ObstacleLayerMask = 1 << obstacleLayer;

            var stateMachine = guard.AddComponent<GuardStateMachine>();
            stateMachine.Perception = perception;
            stateMachine.Waypoints = new[] { waypointA.transform, waypointB.transform };

            var rb = guard.GetComponent<Rigidbody2D>();
            rb.bodyType = RigidbodyType2D.Dynamic;
            rb.gravityScale = 0f;
            rb.constraints = RigidbodyConstraints2D.FreezeRotation;
            rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;

            var collider = guard.AddComponent<BoxCollider2D>();
            collider.size = Vector2.one;

            return guard;
        }

        private static Sprite GetOrCreatePlaceholderSprite()
        {
            var existing = AssetDatabase.LoadAssetAtPath<Sprite>(PlaceholderSpritePath);
            if (existing != null)
            {
                return existing;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(PlaceholderSpritePath));

            var texture = new Texture2D(8, 8, TextureFormat.RGBA32, false);
            var pixels = new Color32[8 * 8];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = Color.white;
            }
            texture.SetPixels32(pixels);
            texture.Apply();

            byte[] pngData = texture.EncodeToPNG();
            File.WriteAllBytes(PlaceholderSpritePath, pngData);
            Object.DestroyImmediate(texture);

            AssetDatabase.ImportAsset(PlaceholderSpritePath, ImportAssetOptions.ForceUpdate);

            var importer = AssetImporter.GetAtPath(PlaceholderSpritePath) as TextureImporter;
            if (importer != null)
            {
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.spritePixelsPerUnit = 8;
                importer.filterMode = FilterMode.Point;
                EditorUtility.SetDirty(importer);
                importer.SaveAndReimport();
            }

            return AssetDatabase.LoadAssetAtPath<Sprite>(PlaceholderSpritePath);
        }
    }
}
